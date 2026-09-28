import { Hono } from "hono";
import type { AppEnv } from "../env";
import { pbkdf2Hash } from "../lib/crypto";
import { errors } from "../lib/errors";
import { usedBytes } from "../lib/nodes";
import { getSetting } from "../lib/settings";
import { requireAdmin } from "../middleware/admin";

export const me = new Hono<AppEnv>();

me.get("/", async (c) => {
  const u = c.get("user");
  // self = 会话原始用户（登录账号）：act-as 查看他人空间时，前端据此区分「登录账号」与「当前空间」
  const s = c.get("selfUser");
  return c.json({
    id: u.id,
    name: u.name,
    role: u.role,
    quotaBytes: u.quota_bytes,
    usedBytes: await usedBytes(c.env.DB, u.id),
    self: { id: s.id, name: s.name, role: s.role },
  });
});

me.put("/webdav-password", async (c) => {
  const { password } = await c.req.json<{ password: string }>();
  if (typeof password !== "string" || password.length < 8) throw errors.badRequest("密码至少 8 位");
  // WebDAV 每个请求都要 verify，用较低迭代数控制边缘 CPU 成本（免费版 10ms CPU 限制）
  await c.env.DB.prepare("UPDATE users SET webdav_password_hash = ?1 WHERE id = ?2")
    .bind(await pbkdf2Hash(password, 50_000), c.get("user").id).run();
  return c.json({ ok: true });
});

me.get("/admin/users", requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, role, quota_bytes, created_at, disabled_at FROM users ORDER BY created_at"
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
  if (!Number.isInteger(trash_retention_days) || (trash_retention_days as number) < TRASH_RETENTION_MIN || (trash_retention_days as number) > TRASH_RETENTION_MAX) {
    throw errors.badRequest(`保留天数须为 ${TRASH_RETENTION_MIN}-${TRASH_RETENTION_MAX} 的整数`);
  }
  await c.env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('trash_retention_days', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(String(trash_retention_days)).run();
  return c.json({ ok: true });
});

me.patch("/admin/users/:id", requireAdmin, async (c) => {
  const { quota_bytes, role, disabled, name } = await c.req.json<{
    quota_bytes?: number; role?: "admin" | "member"; disabled?: boolean; name?: string;
  }>();
  if (role && !["admin", "member"].includes(role)) throw errors.badRequest("角色不合法");
  if (quota_bytes !== undefined && (!Number.isFinite(quota_bytes) || quota_bytes < 0)) throw errors.badRequest("配额不合法");
  if (disabled !== undefined && typeof disabled !== "boolean") throw errors.badRequest("disabled 不合法");
  // 名称：trim 后 1-64 字符（同时是 WebDAV 登录名）
  if (name !== undefined && (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 64)) {
    throw errors.badRequest("名称须为 1-64 字符");
  }
  // 兜底：不允许停用/降级自己（否则无其他 admin 时永久无法恢复）。
  // selfId 是会话原始用户：act-as 切换空间后 c.get("user") 是目标用户，以原始用户判定才能封住借 act-as 绕过的口子。
  if (c.req.param("id") === c.get("selfId") && (disabled === true || role === "member")) {
    throw errors.badRequest("不能停用或降级自己");
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (quota_bytes !== undefined) { sets.push("quota_bytes = ?"); vals.push(quota_bytes); }
  if (role) { sets.push("role = ?"); vals.push(role); }
  if (disabled !== undefined) { sets.push("disabled_at = ?"); vals.push(disabled ? Date.now() : null); }
  if (name !== undefined) { sets.push("name = ?"); vals.push(name.trim()); }
  if (!sets.length) throw errors.badRequest("无可更新字段");
  vals.push(c.req.param("id"));
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});
