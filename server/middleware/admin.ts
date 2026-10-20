import type { Context, Next } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  if (c.get("user").platform_admin !== 1) throw errors.forbidden();
  await next();
}
