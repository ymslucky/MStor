/**
 * 审计事件：安全相关动作（冒充、邀请、撤销）必须留痕。
 * 与业务写同 batch 时用 writeAuditStmt；独立写用 recordAudit。
 */
export function auditStmt(
  db: D1Database,
  ev: { workspaceId?: string | null; actorId: string; action: string; targetId?: string | null; meta?: unknown },
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO audit_events (id, workspace_id, actor_id, action, target_id, meta, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
    )
    .bind(
      crypto.randomUUID(),
      ev.workspaceId ?? null,
      ev.actorId,
      ev.action,
      ev.targetId ?? null,
      ev.meta === undefined ? null : JSON.stringify(ev.meta),
      Date.now(),
    );
}

export async function recordAudit(
  db: D1Database,
  ev: { workspaceId?: string | null; actorId: string; action: string; targetId?: string | null; meta?: unknown },
): Promise<void> {
  await auditStmt(db, ev).run();
}
