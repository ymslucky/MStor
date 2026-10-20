import { errors } from "../lib/errors";

export interface NotificationRow {
  id: string;
  workspace_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: number | null;
  created_at: number;
}

/** 同一类通知的去重窗口：24 小时内不重复打扰（存储告警这类周期性事件用） */
const DEDUPE_WINDOW_MS = 24 * 3600_000;

export function notificationStmt(
  db: D1Database,
  input: { workspaceId: string; userId: string; kind: string; title: string; body?: string | null; link?: string | null },
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO notifications (id, workspace_id, user_id, kind, title, body, link, read_at, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,?8)",
    )
    .bind(
      crypto.randomUUID(),
      input.workspaceId,
      input.userId,
      input.kind,
      input.title,
      input.body ?? null,
      input.link ?? null,
      Date.now(),
    );
}

/** 通知空间内的管理者（owner/admin），返回 user_id 列表 */
export async function workspaceManagerIds(db: D1Database, workspaceId: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT user_id FROM memberships WHERE workspace_id = ?1 AND role IN ('owner','admin')")
    .bind(workspaceId)
    .all<{ user_id: string }>();
  return results.map((r) => r.user_id);
}

/**
 * 给空间管理者发通知（可与业务写同 batch 用 notificationStmt；这里是一次性便捷版）。
 * 去重：同 kind + 同空间在窗口内已有未读通知则跳过，避免刷屏。
 */
export async function notifyManagers(
  db: D1Database,
  input: { workspaceId: string; kind: string; title: string; body?: string | null; link?: string | null; dedupe?: boolean },
): Promise<number> {
  const managers = await workspaceManagerIds(db, input.workspaceId);
  if (!managers.length) return 0;
  if (input.dedupe) {
    const recent = await db
      .prepare(
        "SELECT 1 AS hit FROM notifications WHERE workspace_id = ?1 AND kind = ?2 AND read_at IS NULL AND created_at > ?3 LIMIT 1",
      )
      .bind(input.workspaceId, input.kind, Date.now() - DEDUPE_WINDOW_MS)
      .first();
    if (recent) return 0;
  }
  await db.batch(
    managers.map((userId) =>
      notificationStmt(db, { ...input, userId }),
    ),
  );
  return managers.length;
}

export async function listNotifications(
  db: D1Database,
  userId: string,
  limit = 30,
): Promise<{ items: NotificationRow[]; unread: number }> {
  const [rows, unread] = await db.batch([
    db
      .prepare(
        "SELECT * FROM notifications WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2",
      )
      .bind(userId, limit),
    db.prepare("SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ?1 AND read_at IS NULL").bind(userId),
  ]);
  return {
    items: rows.results as unknown as NotificationRow[],
    unread: (unread.results as { unread: number }[])[0]?.unread ?? 0,
  };
}

/** 只允许改自己的通知：WHERE 带 user_id，拿别人的 id 一律 404 */
export async function markNotificationRead(db: D1Database, userId: string, id: string): Promise<void> {
  const res = await db
    .prepare("UPDATE notifications SET read_at = ?1 WHERE id = ?2 AND user_id = ?3 AND read_at IS NULL")
    .bind(Date.now(), id, userId)
    .run();
  if (!res.meta.changes) {
    // 已经读过也算成功（幂等），但不存在/不属于自己必须 404
    const exists = await db.prepare("SELECT 1 AS hit FROM notifications WHERE id = ?1 AND user_id = ?2").bind(id, userId).first();
    if (!exists) throw errors.notFound();
  }
}

export async function markAllRead(db: D1Database, userId: string): Promise<number> {
  const res = await db
    .prepare("UPDATE notifications SET read_at = ?1 WHERE user_id = ?2 AND read_at IS NULL")
    .bind(Date.now(), userId)
    .run();
  return res.meta.changes;
}

export async function unreadCount(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ?1 AND read_at IS NULL")
    .bind(userId)
    .first<{ unread: number }>();
  return row?.unread ?? 0;
}
