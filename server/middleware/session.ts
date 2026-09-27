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
    sub = payload.sub as string;
  } catch {
    throw errors.unauthorized();
  }
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(sub).first<UserRow>();
  if (!user) throw errors.unauthorized();
  c.set("user", user);
  await next();
}
