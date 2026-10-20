import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { usedBytes } from "../lib/nodes";
import { getSetting } from "../lib/settings";
import { requireAdmin } from "../middleware/admin";
import { PART_SIZE } from "../lib/constants";
import { isUniqueViolation } from "../lib/sql";
import { listMemberships } from "../data/workspaces";
import { listUnboundUsers } from "../data/invitations";

export const me = new Hono<AppEnv>();

me.get("/", async (c) => {
  const u = c.get("user");
  // self = 会话原始用户（登录账号）：act-as 查看他人空间时，前端据此区分「登录账号」与「当前空间」
  const s = c.get("selfUser");
  // used_bytes 与保留天数配置相互独立，并行降低 D1 串行往返（p99 优化）
  const [used, configuredDays] = await Promise.all([
    usedBytes(c.env.DB, c.get("workspace").id),
    getSetting(c.env, "trash_retention_days"),
  ]);
  return c.json({
    id: u.id,
    name: u.name,
    // 客户端契约仍用 admin/member；owner 视同 admin（workspace 内最高权限）
    role: u.platform_admin === 1 ? "admin" : "member",
    quotaBytes: c.get("workspace").quota_bytes,
    usedBytes: used,
    trashRetentionDays: Number(configuredDays ?? c.env.TRASH_RETENTION_DAYS),
    self: { id: s.id, name: s.name, role: s.platform_admin === 1 ? "admin" : "member" },
    // 上传限制由服务端下发，前端不硬编码（小文件直传上限 / 分片大小）
    limits: { smallFileLimit: Number(c.env.SMALL_FILE_LIMIT), partSize: PART_SIZE },
    // 空间列表与当前空间（前端切换器用；切空间 = 带 x-workspace 头）
    workspace: { id: c.get("workspace").id, name: c.get("workspace").name, role: c.get("role") },
    workspaces: (await listMemberships(c.env.DB, u.id)).map(({ workspace, role }) => ({ id: workspace.id, name: workspace.name, role })),
  });
});

me.get("/admin/users", requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT u.id, u.name, u.email, u.created_at, u.disabled_at, u.platform_admin, w.id AS workspace_id, w.quota_bytes, w.used_bytes FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.role = 'owner' LEFT JOIN workspaces w ON w.id = m.workspace_id ORDER BY u.created_at",
  ).all();
  return c.json({ users: results });
});

// 动态配置（admin 设置页）：白名单键 + 应用层校验；读取方（如回收站清理）env 回退
const TRASH_RETENTION_MIN = 1;
const TRASH_RETENTION_MAX = 365;

me.get("/admin/settings", requireAdmin, async (c) => {
  const configured = await getSetting(c.env, "trash_retention_days");
  return c.json({ trash_retention_days: Number(configured ?? c.env.TRASH_RETENTION_DAYS) });
});

me.patch("/admin/settings", requireAdmin, async (c) => {
  const { trash_retention_days } = await c.req.json<{ trash_retention_days?: unknown }>();
  if (
    !Number.isInteger(trash_retention_days) ||
    (trash_retention_days as number) < TRASH_RETENTION_MIN ||
    (trash_retention_days as number) > TRASH_RETENTION_MAX
  ) {
    throw errors.badRequest(`保留天数须为 ${TRASH_RETENTION_MIN}-${TRASH_RETENTION_MAX} 的整数`);
  }
  await c.env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('trash_retention_days', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )
    .bind(String(trash_retention_days))
    .run();
  return c.json({ ok: true });
});

me.get("/admin/unbound", requireAdmin, async (c) => {
  // 有 Access 身份但还没有任何空间的人：管理员据此发邀请或排查"已放行但进不去"
  return c.json({ users: await listUnboundUsers(c.env.DB) });
});

me.patch("/admin/users/:id", requireAdmin, async (c) => {
  const { quota_bytes, role, disabled, name, email } = await c.req.json<{
    quota_bytes?: number;
    role?: "admin" | "member";
    disabled?: boolean;
    name?: string;
    email?: string | null;
  }>();
  if (role && !["admin", "member"].includes(role)) throw errors.badRequest("角色不合法");
  if (quota_bytes !== undefined && (!Number.isFinite(quota_bytes) || quota_bytes < 0))
    throw errors.badRequest("配额不合法");
  if (disabled !== undefined && typeof disabled !== "boolean") throw errors.badRequest("disabled 不合法");
  // 名称：trim 后 1-64 字符
  if (name !== undefined && (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 64)) {
    throw errors.badRequest("名称须为 1-64 字符");
  }
  // 邮箱：Access 身份绑定锚点（首登按 email 锚定存量账号）；null 表示解绑
  if (email !== undefined && email !== null && (typeof email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(email.trim()))) {
    throw errors.badRequest("邮箱格式不合法");
  }
  // 兜底：不允许停用/降级自己（否则无其他 admin 时永久无法恢复）。
  // selfId 是会话原始用户：act-as 切换空间后 c.get("user") 是目标用户，以原始用户判定才能封住借 act-as 绕过的口子。
  if (c.req.param("id") === c.get("selfId") && (disabled === true || role === "member")) {
    throw errors.badRequest("不能停用或降级自己");
  }
  // 兜底：不允许停用/降级自己（否则无其他 admin 时永久无法恢复）
  if (c.req.param("id") === c.get("selfId") && (disabled === true || role === "member")) {
    throw errors.badRequest("不能停用或降级自己");
  }
  const targetId = c.req.param("id");
  const target = await c.env.DB.prepare("SELECT platform_admin, disabled_at FROM users WHERE id = ?1")
    .bind(targetId)
    .first<{ platform_admin: number; disabled_at: number | null }>();
  if (!target) throw errors.notFound();
  // 2.0 里「管理员」是跨空间的 platform_admin；至少保留一名启用中的
  const removesEnabledAdmin =
    target.platform_admin === 1 && target.disabled_at === null && (disabled === true || role === "member");
  if (removesEnabledAdmin) {
    const { n } = (await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE platform_admin = 1 AND disabled_at IS NULL",
    ).first<{ n: number }>())!;
    if (n <= 1) throw errors.badRequest("至少保留一名启用中的管理员");
  }
  // 用户级字段
  const userSets: string[] = [];
  const userVals: unknown[] = [];
  if (role) {
    userSets.push("platform_admin = ?");
    userVals.push(role === "admin" ? 1 : 0);
  }
  if (disabled !== undefined) {
    userSets.push("disabled_at = ?");
    userVals.push(disabled ? Date.now() : null);
  }
  if (name !== undefined) {
    userSets.push("name = ?");
    userVals.push(name.trim());
  }
  if (email !== undefined) {
    userSets.push("email = ?");
    userVals.push(email === null ? null : email.trim().toLowerCase());
  }
  // 配额与租户内角色属于「个人空间」：尚未首登的用户还没有个人空间
  const personal = await c.env.DB.prepare(
    "SELECT w.id AS id FROM workspaces w JOIN memberships m ON m.workspace_id = w.id WHERE m.user_id = ?1 AND m.role = 'owner' LIMIT 1",
  ).bind(targetId).first<{ id: string }>();
  const stmts: D1PreparedStatement[] = [];
  if (userSets.length) {
    stmts.push(c.env.DB.prepare(`UPDATE users SET ${userSets.join(", ")} WHERE id = ?`).bind(...userVals, targetId));
  }
  if (personal) {
    if (quota_bytes !== undefined) {
      stmts.push(c.env.DB.prepare("UPDATE workspaces SET quota_bytes = ?1 WHERE id = ?2").bind(quota_bytes, personal.id));
    }
    if (role) {
      stmts.push(
        c.env.DB.prepare("UPDATE memberships SET role = ?1 WHERE workspace_id = ?2 AND user_id = ?3")
          .bind(role === "admin" ? "owner" : "member", personal.id, targetId),
      );
    }
  } else if (quota_bytes !== undefined || role) {
    throw errors.badRequest("该用户尚未首次登录，暂无个人空间可配置");
  }
  if (!stmts.length) throw errors.badRequest("无可更新字段");
  try {
    await c.env.DB.batch(stmts);
  } catch (e) {
    // email 撞部分唯一索引 idx_users_email → 可行动的 400 而非 500
    if (isUniqueViolation(e)) throw errors.badRequest("该邮箱已绑定其他账号");
    throw e;
  }
  return c.json({ ok: true });
});
