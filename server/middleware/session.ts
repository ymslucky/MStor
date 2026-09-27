import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import type { Context, Next } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import type { UserRow } from "../types";

export const SESSION_COOKIE = "mstor_session";

export async function sessionMiddleware(c: Context<AppEnv>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw errors.unauthorized();
  let sub: string;
  try {
    const payload = await verify(token, c.env.SESSION_SECRET, "HS256");
    if (typeof payload.sub !== "string") throw errors.unauthorized();
    sub = payload.sub;
  } catch {
    throw errors.unauthorized();
  }
  let user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(sub).first<UserRow>();
  if (!user) throw errors.unauthorized();
  if (user.disabled_at) throw errors.forbidden("账号已被停用");
  // admin 切换空间：x-act-as 指向目标用户；非 admin 忽略该头（物理隔离不被绕过）
  const actAs = c.req.header("x-act-as");
  if (actAs && user.role === "admin") {
    const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(actAs).first<UserRow>();
    if (!target) throw errors.notFound();
    if (target.disabled_at) throw errors.forbidden("目标用户已停用");
    user = target;
  }
  // 记录会话原始用户：act-as 切换后 c.get("user") 是目标用户，self 类校验应以原始用户为准
  c.set("selfId", sub);
  c.set("user", user);
  await next();
}
