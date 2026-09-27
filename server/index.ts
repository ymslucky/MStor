import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { errorHandler, errors } from "./lib/errors";

const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "资源不存在" } }, 404));

app.get("/api/health", (c) => c.json({ ok: true }));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.resolve());
  },
} satisfies ExportedHandler<Env>;
