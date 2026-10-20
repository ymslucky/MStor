/**
 * 管理台聚合（方案 P2 B10）：一屏看「人 / 空间 / 存储 / 审计」。
 * 刻意做成 5 条语句的单次聚合，而不是让前端打 5 个接口——管理页打开一次就是 1 个子请求预算批次。
 */
export interface AdminOverview {
  users: { total: number; disabled: number; unbound: number };
  workspaces: { total: number; usedBytes: number };
  topWorkspaces: { id: string; name: string; usedBytes: number; quotaBytes: number; members: number; nodes: number }[];
  recentAudit: { action: string; actorId: string | null; targetId: string | null; workspaceId: string | null; createdAt: number }[];
}

export async function adminOverview(db: D1Database): Promise<AdminOverview> {
  const [userRow, wsRow, unboundRow, topRows, auditRows] = await db.batch([
    db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN disabled_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS disabled FROM users"),
    db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(used_bytes), 0) AS usedBytes FROM workspaces"),
    db.prepare(
      "SELECT COUNT(*) AS unbound FROM users u WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)",
    ),
    db.prepare(
      `SELECT w.id, w.name, w.used_bytes AS usedBytes, w.quota_bytes AS quotaBytes,
         (SELECT COUNT(*) FROM memberships m WHERE m.workspace_id = w.id) AS members,
         (SELECT COUNT(*) FROM nodes n WHERE n.workspace_id = w.id AND n.deleted_at IS NULL) AS nodes
       FROM workspaces w ORDER BY w.used_bytes DESC LIMIT 20`,
    ),
    db.prepare(
      "SELECT action, actor_id AS actorId, target_id AS targetId, workspace_id AS workspaceId, created_at AS createdAt FROM audit_events ORDER BY created_at DESC LIMIT 20",
    ),
  ]);

  const user = (userRow.results as { total: number; disabled: number }[])[0];
  const ws = (wsRow.results as { total: number; usedBytes: number }[])[0];
  const unbound = (unboundRow.results as { unbound: number }[])[0];
  return {
    users: { total: user?.total ?? 0, disabled: user?.disabled ?? 0, unbound: unbound?.unbound ?? 0 },
    workspaces: { total: ws?.total ?? 0, usedBytes: ws?.usedBytes ?? 0 },
    topWorkspaces: topRows.results as AdminOverview["topWorkspaces"],
    recentAudit: auditRows.results as AdminOverview["recentAudit"],
  };
}
