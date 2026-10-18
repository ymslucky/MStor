import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { usedBytes } from "../lib/nodes";
import { getSetting } from "../lib/settings";
import { requireAdmin } from "../middleware/admin";
import { PART_SIZE } from "./uploads";

export const me = new Hono<AppEnv>();

me.get("/", async (c) => {
  const u = c.get("user");
  // self = 会话原始用户（登录账号）：act-as 查看他人空间时，前端据此区分「登录账号」与「当前空间」
  const s = c.get("selfUser");
  // used_bytes 与保留天数配置相互独立，并行降低 D1 串行往返（p99 优化）
  const [used, configuredDays] = await Promise.all([
    usedBytes(c.env.DB, u.id),
    getSetting(c.env, "trash_retention_days"),
  ]);
  return c.json({
    id: u.id,
    name: u.name,
    role: u.role,
    quotaBytes: u.quota_bytes,
    usedBytes: used,
    trashRetentionDays: Number(configuredDays ?? c.env.TRASH_RETENTION_DAYS),
    self: { id: s.id, name: s.name, role: s.role },
    // 上传限制由服务端下发，前端不硬编码（小文件直传上限 / 分片大小）
    limits: { smallFileLimit: Number(c.env.SMALL_FILE_LIMIT), partSize: PART_SIZE },
  });
});

me.get("/admin/users", requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, role, quota_bytes, created_at, disabled_at, email FROM users ORDER BY created_at",
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
  // 兜底：至少保留一名启用中的 admin——停用/降级最后一个 admin 会导致管理入口永久不可恢复
  const target = await c.env.DB.prepare("SELECT role, disabled_at FROM users WHERE id = ?1")
    .bind(c.req.param("id"))
    .first<{ role: string; disabled_at: number | null }>();
  if (!target) throw errors.notFound();
  const removesEnabledAdmin =
    target.role === "admin" && target.disabled_at === null && (disabled === true || role === "member");
  if (removesEnabledAdmin) {
    const { n } = (await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL",
    ).first<{ n: number }>())!;
    if (n <= 1) throw errors.badRequest("至少保留一名启用中的管理员");
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (quota_bytes !== undefined) {
    sets.push("quota_bytes = ?");
    vals.push(quota_bytes);
  }
  if (role) {
    sets.push("role = ?");
    vals.push(role);
  }
  if (disabled !== undefined) {
    sets.push("disabled_at = ?");
    vals.push(disabled ? Date.now() : null);
  }
  if (name !== undefined) {
    sets.push("name = ?");
    vals.push(name.trim());
  }
  if (email !== undefined) {
    sets.push("email = ?");
    vals.push(email === null ? null : email.trim().toLowerCase());
  }
  if (!sets.length) throw errors.badRequest("无可更新字段");
  vals.push(c.req.param("id"));
  try {
    await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...vals)
      .run();
  } catch (e) {
    // email 撞部分唯一索引 idx_users_email → 可行动的 400 而非 500
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) {
      throw errors.badRequest("该邮箱已绑定其他账号");
    }
    throw e;
  }
  return c.json({ ok: true });
});
