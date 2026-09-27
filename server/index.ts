import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { errorHandler, errors } from "./lib/errors";
import { sessionMiddleware } from "./middleware/session";
import { me } from "./routes/me";
import { auth } from "./routes/auth";
import { files } from "./routes/files";
import { dirs } from "./routes/dirs";
import { uploads } from "./routes/uploads";
import { purgeExpiredTrash, trash } from "./routes/trash";
import { search } from "./routes/search";
import { publicShares, shares } from "./routes/shares";
import { dav } from "./routes/dav";

const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "资源不存在" } }, 404));

// health 与公开分享在 session 中间件之前注册，保持免登录
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/s", publicShares);

app.use("/api/*", sessionMiddleware);
app.route("/api/me", me);
app.route("/auth", auth);
app.route("/api/files", files);
app.route("/api/dirs", dirs);
app.route("/api/uploads", uploads);
app.route("/api/trash", trash);
app.route("/api/search", search);
app.route("/api/shares", shares);
// WebDAV 网关：Basic Auth 自校验（davAuth），不走 session
app.route("/dav", dav);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(purgeExpiredTrash(env));
  },
} satisfies ExportedHandler<Env>;
