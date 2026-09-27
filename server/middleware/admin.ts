import type { Context, Next } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  if (c.get("user").role !== "admin") throw errors.forbidden();
  await next();
}
