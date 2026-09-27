import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { errorHandler, errors } from "./lib/errors";
import { sessionMiddleware } from "./middleware/session";
import { me } from "./routes/me";
import { auth } from "./routes/auth";
import { files } from "./routes/files";
import { dirs } from "./routes/dirs";

const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "资源不存在" } }, 404));

// health 在 session 中间件之前注册，保持免登录
app.get("/api/health", (c) => c.json({ ok: true }));

app.use("/api/*", sessionMiddleware);
app.route("/api/me", me);
app.route("/auth", auth);
app.route("/api/files", files);
app.route("/api/dirs", dirs);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.resolve());
  },
} satisfies ExportedHandler<Env>;
