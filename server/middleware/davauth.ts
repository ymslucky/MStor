import type { Context, Next } from "hono";
import type { AppEnv } from "../env";
import { pbkdf2Verify, unb64 } from "../lib/crypto";
import type { UserRow } from "../types";

export async function davAuth(c: Context<AppEnv>, next: Next) {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();
  let name: string, password: string;
  try {
    // atob 是 Latin-1 解码，会破坏非 ASCII 密码；统一按 UTF-8 解码 Basic 凭据
    const decoded = new TextDecoder().decode(unb64(header.slice(6).trim()));
    // 密码本身可含冒号：只在首个冒号处切分
    const sep = decoded.indexOf(":");
    if (sep < 0) return unauthorized();
    name = decoded.slice(0, sep);
    password = decoded.slice(sep + 1);
  } catch {
    return unauthorized();
  }
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE name = ?1").bind(name).first<UserRow>();
  if (!user?.webdav_password_hash || !(await pbkdf2Verify(password, user.webdav_password_hash))) {
    return unauthorized();
  }
  c.set("user", user);
  await next();
}

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="MStor"' } });
}
