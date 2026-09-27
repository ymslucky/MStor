import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { errorHandler, errors } from "./lib/errors";
import { sessionMiddleware } from "./middleware/session";
import { me } from "./routes/me";

const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "资源不存在" } }, 404));

app.get("/api/health", (c) => c.json({ ok: true }));

app.use("/api/*", sessionMiddleware);
app.route("/api/me", me);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.resolve());
  },
} satisfies ExportedHandler<Env>;
