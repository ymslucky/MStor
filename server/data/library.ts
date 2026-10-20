import { errors } from "../lib/errors";
import type { NodeRow } from "../types";

/** 最近访问节流窗口：同一节点 5 分钟内重复打开不写库（避免预览翻页把 D1 写放大） */
const VIEW_THROTTLE_MS = 5 * 60_000;

/** 收藏/最近只认「当前空间内、未删除」的节点：拿到别人的 id 一律 404 */
async function requireLiveNode(db: D1Database, workspaceId: string, nodeId: string): Promise<void> {
  const row = await db
    .prepare("SELECT 1 AS hit FROM nodes WHERE id = ?1 AND workspace_id = ?2 AND deleted_at IS NULL")
    .bind(nodeId, workspaceId)
    .first();
  if (!row) throw errors.notFound();
}

export async function addFavorite(db: D1Database, workspaceId: string, userId: string, nodeId: string): Promise<void> {
  await requireLiveNode(db, workspaceId, nodeId);
  await db
    .prepare("INSERT OR IGNORE INTO favorites (workspace_id, user_id, node_id, created_at) VALUES (?1,?2,?3,?4)")
    .bind(workspaceId, userId, nodeId, Date.now())
    .run();
}

export async function removeFavorite(db: D1Database, workspaceId: string, userId: string, nodeId: string): Promise<void> {
  await db
    .prepare("DELETE FROM favorites WHERE workspace_id = ?1 AND user_id = ?2 AND node_id = ?3")
    .bind(workspaceId, userId, nodeId)
    .run();
}

/** 收藏列表：一次 join 取节点，按收藏时间倒序 */
export async function listFavorites(db: D1Database, workspaceId: string, userId: string, limit = 100): Promise<NodeRow[]> {
  const { results } = await db
    .prepare(
      `SELECT n.* FROM favorites f JOIN nodes n ON n.id = f.node_id
       WHERE f.workspace_id = ?1 AND f.user_id = ?2 AND n.deleted_at IS NULL
       ORDER BY f.created_at DESC LIMIT ?3`,
    )
    .bind(workspaceId, userId, limit)
    .all<NodeRow>();
  return results;
}

/** 记录一次访问（5 分钟节流）：ON CONFLICT 的 WHERE 让重复访问不产生写入 */
export async function recordView(db: D1Database, workspaceId: string, userId: string, nodeId: string): Promise<void> {
  await requireLiveNode(db, workspaceId, nodeId);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO node_views (workspace_id, user_id, node_id, viewed_at) VALUES (?1,?2,?3,?4)
       ON CONFLICT (workspace_id, user_id, node_id) DO UPDATE SET viewed_at = excluded.viewed_at
       WHERE node_views.viewed_at < excluded.viewed_at - ?5`,
    )
    .bind(workspaceId, userId, nodeId, now, VIEW_THROTTLE_MS)
    .run();
}

export async function listRecent(db: D1Database, workspaceId: string, userId: string, limit = 20): Promise<NodeRow[]> {
  const { results } = await db
    .prepare(
      `SELECT n.* FROM node_views v JOIN nodes n ON n.id = v.node_id
       WHERE v.workspace_id = ?1 AND v.user_id = ?2 AND n.deleted_at IS NULL
       ORDER BY v.viewed_at DESC LIMIT ?3`,
    )
    .bind(workspaceId, userId, limit)
    .all<NodeRow>();
  return results;
}
