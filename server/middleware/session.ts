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
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(sub).first<UserRow>();
  if (!user) throw errors.unauthorized();
  if (user.disabled_at) throw errors.forbidden("账号已被停用");
  c.set("user", user);
  await next();
}
