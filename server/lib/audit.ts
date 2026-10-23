/**
 * 审计事件 v2：动作级、带分类/结果/严重级/上下文/资源。
 * 与业务写同 batch 时用 auditStmt；独立写用 recordAudit。
 */
export type AuditCategory = "auth" | "admin" | "file" | "share" | "member" | "security";
export type AuditResult = "success" | "denied" | "failed";
export type AuditSeverity = "info" | "warn" | "critical";

export interface AuditEventInput {
  workspaceId?: string | null;
  actorId: string;
  action: string;
  targetId?: string | null;
  meta?: unknown;
  requestId?: string | null;
  category?: AuditCategory;
  result?: AuditResult;
  severity?: AuditSeverity;
  actorIpHash?: string | null;
  actorUa?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
}

function inferCategory(action: string): AuditCategory {
  if (action.startsWith("auth.")) return "auth";
  if (action.startsWith("admin.")) return "admin";
  if (action.startsWith("file.") || action.startsWith("node.")) return "file";
  if (action.startsWith("share.")) return "share";
  if (action.startsWith("invitation.") || action.startsWith("member.")) return "member";
  return "security";
}

function inferSeverity(action: string): AuditSeverity {
  if (action === "admin.act_as" || action === "node.purge" || action === "node.batch_purge") return "critical";
  if (action.startsWith("admin.") || action.startsWith("share.") || action.startsWith("node.") || action === "auth.denied") return "warn";
  return "info";
}

export function auditStmt(db: D1Database, ev: AuditEventInput): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO audit_events (id, workspace_id, actor_id, action, target_id, meta, request_id, category, result, severity, actor_ip_hash, actor_ua, resource_type, resource_id, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
    )
    .bind(
      crypto.randomUUID(),
      ev.workspaceId ?? null,
      ev.actorId,
      ev.action,
      ev.targetId ?? null,
      ev.meta === undefined ? null : JSON.stringify(ev.meta),
      ev.requestId ?? null,
      ev.category ?? inferCategory(ev.action),
      ev.result ?? "success",
      ev.severity ?? inferSeverity(ev.action),
      ev.actorIpHash ?? null,
      ev.actorUa ?? null,
      ev.resourceType ?? null,
      ev.resourceId ?? null,
      Date.now(),
    );
}

export async function recordAudit(db: D1Database, ev: AuditEventInput): Promise<void> {
  await auditStmt(db, ev).run();
}
