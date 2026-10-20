import { errors } from "../lib/errors";
import { isUniqueViolation } from "../lib/sql";
import type { WorkspaceRole } from "../types";

/** 邀请有效期：7 天（够转发给人，过期需重发） */
const INVITE_TTL_MS = 7 * 86_400_000;

export interface InvitationRow {
  token_hash: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  created_at: number;
  expires_at: number;
  accepted_at: number | null;
}

/** 令牌只存 sha256：库里泄露也拿不到可用邀请链接 */
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 建邀请：返回明文 token（只此一次可见）。同一 email 重复邀请时旧邀请失效——
 * 避免「发了三次邀请，前两个链接还能用」这种不可推理的状态。
 */
export async function createInvitation(
  db: D1Database,
  workspaceId: string,
  rawEmail: string,
  role: WorkspaceRole,
  actorId: string,
): Promise<{ token: string; expiresAt: number }> {
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw errors.badRequest("邮箱格式不合法");
  if (role === "owner") throw errors.badRequest("不能邀请 owner");
  const token = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const tokenHash = await hashInviteToken(token);
  const now = Date.now();
  const expiresAt = now + INVITE_TTL_MS;
  try {
    await db.batch([
      // 旧邀请作废（同 workspace + email 且未被接受的）
      db.prepare("DELETE FROM invitations WHERE workspace_id = ?1 AND email = ?2 AND accepted_at IS NULL")
        .bind(workspaceId, email),
      db.prepare(
        "INSERT INTO invitations (token_hash, workspace_id, email, role, created_at, expires_at, accepted_at) VALUES (?1,?2,?3,?4,?5,?6,NULL)",
      ).bind(tokenHash, workspaceId, email, role, now, expiresAt),
      // 审计与业务写同 batch
      db.prepare(
        "INSERT INTO audit_events (id, workspace_id, actor_id, action, target_id, meta, created_at) VALUES (?1,?2,?3,'invitation.create',?4,?5,?6)",
      ).bind(crypto.randomUUID(), workspaceId, actorId, email, JSON.stringify({ role }), now),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) throw errors.conflict("邀请已存在，请重试");
    throw e;
  }
  return { token, expiresAt };
}

/** 当前 workspace 的待接受邀请（不回传 token_hash 之外的任何凭据） */
export async function listInvitations(db: D1Database, workspaceId: string): Promise<
  { email: string; role: WorkspaceRole; created_at: number; expires_at: number }[]
> {
  const { results } = await db.prepare(
    `SELECT email, role, created_at, expires_at, accepted_at FROM invitations
     WHERE workspace_id = ?1 AND accepted_at IS NULL AND expires_at > ?2 ORDER BY created_at DESC`,
  ).bind(workspaceId, Date.now()).all<{ email: string; role: WorkspaceRole; created_at: number; expires_at: number }>();
  return results;
}

/** 撤销邀请：按明文 token 定位（只有拿到链接的人知道） */
export async function revokeInvitation(db: D1Database, workspaceId: string, token: string, actorId: string): Promise<void> {
  const tokenHash = await hashInviteToken(token);
  const res = await db.prepare("DELETE FROM invitations WHERE token_hash = ?1 AND workspace_id = ?2 AND accepted_at IS NULL")
    .bind(tokenHash, workspaceId).run();
  if (!res.meta.changes) throw errors.notFound();
  await db.prepare(
    "INSERT INTO audit_events (id, workspace_id, actor_id, action, target_id, created_at) VALUES (?1,?2,?3,'invitation.revoke',?4,?5)",
  ).bind(crypto.randomUUID(), workspaceId, actorId, tokenHash, Date.now()).run();
}

/**
 * 首登认领：按 email 匹配未过期且未接受的邀请 → 落 membership。
 * 返回被加入的 workspace id 列表（空表示没有待领邀请）。
 * 幂等：memberships 用 INSERT OR IGNORE，重复登录不会报错也不会重复计数。
 */
export async function acceptPendingInvitations(db: D1Database, userId: string, rawEmail: string | null): Promise<string[]> {
  if (!rawEmail) return [];
  const email = normalizeEmail(rawEmail);
  const now = Date.now();
  const { results } = await db.prepare(
    "SELECT token_hash, workspace_id, role FROM invitations WHERE email = ?1 AND accepted_at IS NULL AND expires_at > ?2",
  ).bind(email, now).all<{ token_hash: string; workspace_id: string; role: WorkspaceRole }>();
  if (!results.length) return [];
  const stmts = results.flatMap((inv) => [
    db.prepare("INSERT OR IGNORE INTO memberships (workspace_id, user_id, role, created_at) VALUES (?1,?2,?3,?4)")
      .bind(inv.workspace_id, userId, inv.role, now),
    db.prepare("UPDATE invitations SET accepted_at = ?1 WHERE token_hash = ?2").bind(now, inv.token_hash),
    db.prepare("INSERT INTO audit_events (id, workspace_id, actor_id, action, target_id, created_at) VALUES (?1,?2,?3,'invitation.accept',?2,?4)")
      .bind(crypto.randomUUID(), inv.workspace_id, userId, now),
  ]);
  await db.batch(stmts);
  return results.map((r) => r.workspace_id);
}

/** 待绑定成员视图：有 Access 身份但还没有任何 workspace 的用户（管理员排障用） */
export async function listUnboundUsers(db: D1Database): Promise<
  { id: string; name: string; email: string | null; created_at: number }[]
> {
  const { results } = await db.prepare(
    `SELECT u.id, u.name, u.email, u.created_at FROM users u
     WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)
     ORDER BY u.created_at DESC LIMIT 200`,
  ).all<{ id: string; name: string; email: string | null; created_at: number }>();
  return results;
}

/** 供路由层列出某 workspace 成员 */
export async function listMembers(db: D1Database, workspaceId: string): Promise<
  { user_id: string; name: string; email: string | null; role: WorkspaceRole; created_at: number }[]
> {
  const { results } = await db.prepare(
    `SELECT m.user_id, u.name, u.email, m.role, m.created_at FROM memberships m
     JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ?1 ORDER BY m.created_at`,
  ).bind(workspaceId).all<{ user_id: string; name: string; email: string | null; role: WorkspaceRole; created_at: number }>();
  return results;
}
