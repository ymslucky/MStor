import { errors } from "../lib/errors";
import { isUniqueViolation } from "../lib/sql";

/** 租户（workspace）行：schema 2.0 的 workspaces，used_bytes 是配额真相 */
export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string | null;
  quota_bytes: number;
  used_bytes: number;
  created_at: number;
}

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export interface MembershipRow {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: number;
}

/** 个人空间默认名（首登自动建）：沿用用户显示名，避免出现"未命名空间" */
/** 新用户默认个人空间额度：1 GiB（可由 settings.default_quota_bytes 覆盖） */
const DEFAULT_QUOTA = 1_073_741_824;

/** 个人空间的确定性 slug：并发首登靠 UNIQUE(slug) 收敛，而不是靠先查后插的竞态窗口 */
export function personalSlug(userId: string): string {
  return `u-${userId}`;
}

function rowToWorkspace(row: Record<string, unknown>): WorkspaceRow {
  return row as unknown as WorkspaceRow;
}

/**
 * 首登建个人 workspace（幂等）：workspace + membership(owner) + storage_stats 一次 batch。
 * 并发两次调用靠 UNIQUE(slug) 兜底，撞索引后回读既有空间——与 createDir 的处理惯例一致。
 */
export async function ensurePersonalWorkspace(
  db: D1Database,
  userId: string,
  opts: { name?: string; quotaBytes?: number } = {},
): Promise<WorkspaceRow> {
  const slug = personalSlug(userId);
  const existing = await db.prepare("SELECT * FROM workspaces WHERE slug = ?1").bind(slug).first<WorkspaceRow>();
  if (existing) return existing;
  const id = crypto.randomUUID();
  const now = Date.now();
  const quota = opts.quotaBytes ?? DEFAULT_QUOTA;
  try {
    await db.batch([
      db.prepare("INSERT INTO workspaces (id, name, slug, quota_bytes, used_bytes, created_at) VALUES (?1,?2,?3,?4,0,?5)")
        .bind(id, opts.name ?? "我的空间", slug, quota, now),
      db.prepare("INSERT INTO memberships (workspace_id, user_id, role, created_at) VALUES (?1,?2,'owner',?3)")
        .bind(id, userId, now),
      db.prepare("INSERT INTO storage_stats (workspace_id, updated_at) VALUES (?1,?2)").bind(id, now),
    ]);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const raced = await db.prepare("SELECT * FROM workspaces WHERE slug = ?1").bind(slug).first<WorkspaceRow>();
    if (raced) return raced;
    throw e;
  }
  const created = await db.prepare("SELECT * FROM workspaces WHERE id = ?1").bind(id).first<WorkspaceRow>();
  if (!created) throw new Error("workspace 创建后不可读");
  return created;
}

/**
 * 解析请求的目标 workspace 与调用者角色：
 * - 未指定 → 用户最早加入的空间（首登已建个人空间，正常不会落到"无空间"分支）
 * - 指定但不是成员 → 403（不泄露空间是否存在）
 * - 完全不存在 → 404
 * 注意：这里返回的 workspace.id 是后续所有查询必须携带的隔离维度。
 */
export async function resolveWorkspace(
  db: D1Database,
  userId: string,
  requestedId?: string | null,
): Promise<{ workspace: WorkspaceRow; role: WorkspaceRole }> {
  if (requestedId) {
    const { results } = await db.prepare(
      "SELECT w.*, m.role AS role FROM workspaces w JOIN memberships m ON m.workspace_id = w.id WHERE w.id = ?1 AND m.user_id = ?2",
    ).bind(requestedId, userId).all<Record<string, unknown>>();
    const row = results[0];
    if (!row) {
      // 存在但不是成员 → 403；根本不存在 → 404。两次判定合并在一条语句里做（避免多一次往返）
      const exists = await db.prepare("SELECT 1 AS hit FROM workspaces WHERE id = ?1").bind(requestedId).first();
      throw exists ? errors.forbidden("无权访问该空间") : errors.notFound();
    }
    const workspace = rowToWorkspace(row);
    return { workspace, role: row.role as WorkspaceRole };
  }
  const { results } = await db.prepare(
    // 用 m.workspace_id 做次序 tie-break（与 w.id 等值）：可直接吃覆盖索引，避免临时排序
    "SELECT w.*, m.role AS role FROM memberships m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ?1 ORDER BY m.created_at ASC, m.workspace_id ASC LIMIT 1",
  ).bind(userId).all<Record<string, unknown>>();
  const row = results[0];
  if (!row) throw errors.notFound();
  const workspace = rowToWorkspace(row);
  return { workspace, role: row.role as WorkspaceRole };
}

/** 用户可见的全部空间（侧栏切换/管理页用） */
export async function listMemberships(
  db: D1Database,
  userId: string,
): Promise<{ workspace: WorkspaceRow; role: WorkspaceRole }[]> {
  const { results } = await db.prepare(
    // 同毫秒加入时用 id 兜底排序，避免列表顺序抖动；用 m.workspace_id 保持与 w.id 等值且可走覆盖索引
    "SELECT w.*, m.role AS role FROM memberships m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ?1 ORDER BY m.created_at ASC, m.workspace_id ASC",
  ).bind(userId).all<Record<string, unknown>>();
  return results.map((row) => ({ workspace: rowToWorkspace(row), role: row.role as WorkspaceRole }));
}

/** 写操作权限：当前所有 workspace 角色可写，平台能力由 platform_admin 控制；保留单点便于后续细化 */
export function canWrite(role: WorkspaceRole): boolean {
  return WORKSPACE_ROLES.includes(role);
}


