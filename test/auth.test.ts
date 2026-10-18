import { env, SELF } from "cloudflare:test";
import { Hono } from "hono";
import type { AppEnv } from "../server/env";
import { errorHandler } from "../server/lib/errors";
import { accessMiddleware } from "../server/middleware/access";
import { expect, test } from "vitest";
import { bindOrProvision } from "../server/lib/users";
import { seedUser, sessionHeaders, signAccessJwt } from "./helpers";

const BASE = "https://example.com";

function auth(token: string): { "cf-access-jwt-assertion": string } {
  return { "cf-access-jwt-assertion": token };
}

test("缺少 assertion → 401", async () => {
  const res = await SELF.fetch(`${BASE}/api/me`);
  expect(res.status).toBe(401);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
});

test("伪造 assertion（垃圾 token）→ 401", async () => {
  const res = await SELF.fetch(`${BASE}/api/me`, { headers: auth("not.a.jwt") });
  expect(res.status).toBe(401);
});

test("错 audience / 错 issuer / 过期 → 401", async () => {
  const claims = { sub: "s-x", email: "x@example.com" };
  const badAud = await signAccessJwt({ ...claims, aud: "other-app-aud" });
  const badIss = await signAccessJwt({ ...claims, iss: "https://evil.cloudflareaccess.com" });
  const expired = await signAccessJwt({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 });
  for (const token of [badAud, badIss, expired]) {
    const res = await SELF.fetch(`${BASE}/api/me`, { headers: auth(token) });
    expect(res.status, `token=${token.slice(0, 24)}…`).toBe(401);
  }
});

test("sub 为空串（service token 误配）→ 401", async () => {
  const token = await signAccessJwt({ sub: "", email: "svc@example.com" });
  const res = await SELF.fetch(`${BASE}/api/me`, { headers: auth(token) });
  expect(res.status).toBe(401);
});

test("email 锚点：命中存量账号 → 复用同一 id 并回填 access_sub", async () => {
  const u = await seedUser({ email: "alice@example.com", access_sub: "legacy-oidc-sub" });
  const token = await signAccessJwt({ sub: "new-access-sub", email: "alice@example.com" });
  const res = await SELF.fetch(`${BASE}/api/me`, { headers: auth(token) });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { id: string };
  expect(body.id).toBe(u.id); // 同一账号，数据不迁移
  const row = await env.DB.prepare("SELECT access_sub FROM users WHERE id = ?1")
    .bind(u.id)
    .first<{ access_sub: string }>();
  expect(row!.access_sub).toBe("new-access-sub"); // 自愈回填
  const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())!;
  expect(n).toBe(1); // 未产生第二个账号
});

test("未知身份 + ACCESS_PROVISION=off → 403 ACCOUNT_NOT_PROVISIONED", async () => {
  await expect(
    bindOrProvision({ ...env, ACCESS_PROVISION: "off" }, { sub: "s-unknown", email: "who@example.com" }),
  ).rejects.toMatchObject({ status: 403 });
});

test("首个建号用户为 admin，其后为 member", async () => {
  await env.DB.prepare("DELETE FROM users").run();
  const first = await bindOrProvision(env, { sub: "s-first", email: "first@example.com" });
  expect(first.role).toBe("admin");
  const second = await bindOrProvision(env, { sub: "s-second", email: "second@example.com" });
  expect(second.role).toBe("member");
});

test("已停用用户 → 403", async () => {
  const u = await seedUser();
  await env.DB.prepare("UPDATE users SET disabled_at = ?1 WHERE id = ?2").bind(Date.now(), u.id).run();
  const res = await SELF.fetch(`${BASE}/api/me`, { headers: await sessionHeaders(u) });
  expect(res.status).toBe(403);
  expect(((await res.json()) as { error: { message: string } }).error.message).toContain("停用");
});

test("跨站 Origin / Sec-Fetch-Site 的非 GET 请求 → 403", async () => {
  const u = await seedUser();
  const base = await sessionHeaders(u);
  const byOrigin = await SELF.fetch(`${BASE}/api/dirs`, {
    method: "POST",
    headers: { ...base, "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ name: "x" }),
  });
  expect(byOrigin.status).toBe(403);
  const bySite = await SELF.fetch(`${BASE}/api/dirs`, {
    method: "POST",
    headers: { ...base, "content-type": "application/json", "sec-fetch-site": "cross-site" },
    body: JSON.stringify({ name: "x" }),
  });
  expect(bySite.status).toBe(403);
});

test("跨协议同 Host 的 Origin 仍视为跨站 → 403", async () => {
  const u = await seedUser();
  const res = await SELF.fetch(`${BASE}/api/dirs`, {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json", origin: "http://example.com" },
    body: JSON.stringify({ name: "x" }),
  });
  expect(res.status).toBe(403);
});

test("同源 Origin 的非 GET 请求进入业务校验而非被 CSRF 拒绝", async () => {
  const u = await seedUser({ role: "admin" });
  const res = await SELF.fetch(`${BASE}/api/me/admin/users/${u.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json", origin: BASE },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("BAD_REQUEST");
});

test("dev 认证模式带 cf-ray（真实边缘）→ 拒绝", async () => {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use("/api/*", accessMiddleware);
  app.get("/api/me", (c) => c.json({ ok: true }));
  const res = await app.request(
    `${BASE}/api/me`,
    { headers: { "cf-ray": "test-edge-ray" } },
    { ...env, AUTH_MODE: "dev" },
  );
  expect(res.status).toBe(403);
  expect(((await res.json()) as { error: { message: string } }).error.message).toContain("真实边缘");
});

test("email 锚点不能把已属于其他账号的 Access sub 抢过来", async () => {
  const owner = await seedUser({ access_sub: "owned-access-sub", email: "owner@example.com" });
  const legacy = await seedUser({ access_sub: "legacy-oidc-sub", email: "incoming@example.com" });
  await expect(bindOrProvision(env, { sub: owner.access_sub, email: legacy.email })).rejects.toMatchObject({
    status: 409,
    code: "IDENTITY_CONFLICT",
  });
  const row = await env.DB.prepare("SELECT access_sub FROM users WHERE id = ?1")
    .bind(legacy.id)
    .first<{ access_sub: string }>();
  expect(row!.access_sub).toBe("legacy-oidc-sub");
});

test("已确认绑定的 email 不能被另一个 Access sub 静默顶替", async () => {
  const bound = await seedUser({
    access_sub: "confirmed-access-sub",
    email: "alice@example.com",
    access_bound_at: Date.now(),
  });
  await expect(bindOrProvision(env, { sub: "different-access-sub", email: bound.email })).rejects.toMatchObject({
    status: 409,
    code: "IDENTITY_CONFLICT",
  });
  const row = await env.DB.prepare("SELECT access_sub, access_bound_at FROM users WHERE id = ?1")
    .bind(bound.id)
    .first<{ access_sub: string; access_bound_at: number }>();
  expect(row!.access_sub).toBe("confirmed-access-sub");
  expect(row!.access_bound_at).toBe(bound.access_bound_at);
});

test("静态测试 JWKS 出现在真实边缘（cf-ray）→ 拒绝", async () => {
  const u = await seedUser();
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use("/api/*", accessMiddleware);
  app.get("/api/me", (c) => c.json({ ok: true }));
  const res = await app.request(
    `${BASE}/api/me`,
    { headers: { ...(await sessionHeaders(u)), "cf-ray": "test-edge-ray" } },
    env,
  );
  expect(res.status).toBe(403);
  expect(((await res.json()) as { error: { message: string } }).error.message).toContain("测试 JWKS");
});

test("缺少 exp 的 assertion → 401（过期时间必须存在）", async () => {
  const token = await signAccessJwt({ sub: "s-no-exp", email: "no-exp@example.com", exp: null });
  const res = await SELF.fetch(`${BASE}/api/me`, { headers: auth(token) });
  expect(res.status).toBe(401);
});
