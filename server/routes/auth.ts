import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import type { AppEnv, Env } from "../env";
import { errors } from "../lib/errors";
import { randomToken, sha256B64Url, unb64 } from "../lib/crypto";
import { ensureRootDir } from "../lib/nodes";
import { SESSION_COOKIE } from "../middleware/session";

export const auth = new Hono<AppEnv>();

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
}

async function discover(env: Env): Promise<Discovery> {
  const res = await fetch(`${env.OIDC_ISSUER}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error("OIDC discovery failed");
  return (await res.json()) as Discovery;
}

auth.get("/login", async (c) => {
  const cfg = await discover(c.env);
  const verifier = randomToken(48);
  const state = randomToken(16);
  // 手动拼接并用 encodeURIComponent（空格 → %20）：URLSearchParams 会编成 '+'，
  // 部分对 authorize 查询做签名校验的 IdP 规范化后只认 %20，会导致 consent 阶段 invalid_signature
  const params: Record<string, string> = {
    client_id: c.env.OIDC_CLIENT_ID,
    redirect_uri: `${c.env.PUBLIC_URL}/auth/callback`,
    response_type: "code",
    scope: "openid profile email",
    state,
    code_challenge: await sha256B64Url(verifier),
    code_challenge_method: "S256",
  };
  const query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const url = new URL(`${cfg.authorization_endpoint}?${query}`);
  setCookie(c, "mstor_oidc", JSON.stringify({ state, verifier }), {
    httpOnly: true, secure: true, path: "/", maxAge: 600, sameSite: "Lax",
  });
  return c.redirect(url.toString());
});

auth.get("/callback", async (c) => {
  const raw = getCookie(c, "mstor_oidc");
  if (!raw) throw errors.unauthorized();
  let saved: { state: string; verifier: string };
  try {
    saved = JSON.parse(raw) as { state: string; verifier: string };
  } catch {
    // cookie 损坏时不走 errorHandler 的 SyntaxError→400 文案，直接 401
    throw errors.unauthorized();
  }
  if (c.req.query("state") !== saved.state) throw errors.unauthorized();
  const cfg = await discover(c.env);
  const res = await fetch(cfg.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: c.req.query("code") ?? "",
      redirect_uri: `${c.env.PUBLIC_URL}/auth/callback`,
      client_id: c.env.OIDC_CLIENT_ID,
      client_secret: c.env.OIDC_CLIENT_SECRET,
      code_verifier: saved.verifier,
    }),
  });
  if (!res.ok) throw errors.unauthorized();
  const { id_token } = (await res.json()) as { id_token: string };
  // token 经服务端直连 IdP 换取（TLS + client_secret），claims 可信，无需再验签
  const payloadB64 = id_token.split(".")[1];
  const claims = JSON.parse(new TextDecoder().decode(unb64(payloadB64))) as { sub: string; name?: string; preferred_username?: string; role?: string };
  const name = claims.name ?? claims.preferred_username ?? "user";
  const db = c.env.DB;
  let user = await db.prepare("SELECT * FROM users WHERE oidc_sub = ?1").bind(claims.sub).first<{ id: string; role: string; disabled_at: number | null }>();
  if (!user) {
    const count = await db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
    const role = count!.n === 0 || claims.role === "admin" ? "admin" : "member";
    const id = randomToken(12);
    try {
      await db.prepare(
        "INSERT INTO users (id, oidc_sub, name, role, webdav_password_hash, quota_bytes, created_at) VALUES (?1,?2,?3,?4,NULL,?5,?6)"
      ).bind(id, claims.sub, name, role, Number(c.env.DEFAULT_QUOTA_BYTES), Date.now()).run();
      user = { id, role, disabled_at: null };
    } catch (e) {
      if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) {
        // 并发首登：另一个请求已建号，幂等复用
        user = await db.prepare("SELECT * FROM users WHERE oidc_sub = ?1").bind(claims.sub).first<{ id: string; role: string; disabled_at: number | null }>();
        if (!user) throw e;
      } else {
        throw e;
      }
    }
  }
  if (user.disabled_at) throw errors.forbidden("账号已被停用");
  await ensureRootDir(db, user.id);
  const token = await sign({ sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }, c.env.SESSION_SECRET);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, secure: true, path: "/", maxAge: 7 * 86400, sameSite: "Lax",
  });
  setCookie(c, "mstor_oidc", "", { path: "/", maxAge: 0 });
  return c.redirect("/");
});

auth.get("/logout", (c) => {
  setCookie(c, SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return c.redirect("/");
});
