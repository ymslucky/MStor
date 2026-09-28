import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { errorHandler } from "./lib/errors";
import { sessionMiddleware } from "./middleware/session";
import { auth } from "./routes/auth";
import { publicShares, shares } from "./routes/shares";
import { me } from "./routes/me";
import { files } from "./routes/files";
import { dirs } from "./routes/dirs";
import { uploads } from "./routes/uploads";
import { trash, purgeExpiredTrash } from "./routes/trash";
import { search } from "./routes/search";
import { dav } from "./routes/dav";

const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "资源不存在" } }, 404));

// health、OIDC 登录与公开分享在 session 中间件之前注册，保持免登录
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/auth", auth);
app.route("/api/s", publicShares);

app.use("/api/*", sessionMiddleware);
app.route("/api/me", me);
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
    // 每日全量校准 used_bytes 兜底（防止极端并发下冗余列漂移）；一天一次全表 SUM 成本可忽略
    ctx.waitUntil(Promise.all([
      purgeExpiredTrash(env),
      env.DB.prepare(`UPDATE users SET used_bytes = (
        SELECT COALESCE(SUM(size), 0) FROM nodes
        WHERE nodes.owner_id = users.id AND deleted_at IS NULL
      )`).run(),
    ]));
  },
} satisfies ExportedHandler<Env>;
