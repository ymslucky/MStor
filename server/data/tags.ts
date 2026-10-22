import { errors } from "../lib/errors";
import { isUniqueViolation } from "../lib/sql";
import type { NodeRow } from "../types";

export interface TagRow {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  created_at: number;
}

const MAX_NAME = 32;

function normalizeName(raw: unknown): string {
  if (typeof raw !== "string") throw errors.badRequest("标签名必填");
  const name = raw.trim();
  if (!name || name.length > MAX_NAME) throw errors.badRequest(`标签名须为 1-${MAX_NAME} 字符`);
  return name;
}

export async function listTags(
  db: D1Database,
  workspaceId: string,
): Promise<(TagRow & { nodes: number })[]> {
  const { results } = await db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM node_tags nt WHERE nt.tag_id = t.id) AS nodes
       FROM tags t WHERE t.workspace_id = ?1 ORDER BY t.name`,
    )
    .bind(workspaceId)
    .all<TagRow & { nodes: number }>();
  return results;
}

export async function createTag(db: D1Database, workspaceId: string, rawName: unknown, color: unknown): Promise<TagRow> {
  const name = normalizeName(rawName);
  const safeColor = typeof color === "string" && /^#[0-9a-f]{3,8}$/i.test(color) ? color : null;
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await db
      .prepare("INSERT INTO tags (id, workspace_id, name, color, created_at) VALUES (?1,?2,?3,?4,?5)")
      .bind(id, workspaceId, name, safeColor, now)
      .run();
  } catch (e) {
    if (isUniqueViolation(e)) throw errors.conflict("同名标签已存在");
    throw e;
  }
  return { id, workspace_id: workspaceId, name, color: safeColor, created_at: now };
}

/** 更新标签名/颜色（颜色传 null 表示清除；至少提供一个字段） */
export async function updateTag(
  db: D1Database,
  workspaceId: string,
  tagId: string,
  rawName: unknown,
  color: unknown,
): Promise<TagRow> {
  const sets: string[] = [];
  const binds: (string | null)[] = [];
  if (rawName !== undefined) {
    sets.push("name = ?");
    binds.push(normalizeName(rawName));
  }
  if (color !== undefined) {
    if (color !== null && !(typeof color === "string" && /^#[0-9a-f]{3,8}$/i.test(color))) {
      throw errors.badRequest("颜色格式无效");
    }
    sets.push("color = ?");
    binds.push(color as string | null);
  }
  if (sets.length === 0) throw errors.badRequest("没有需要更新的字段");
  binds.push(tagId, workspaceId);
  const res = await db
    .prepare(`UPDATE tags SET ${sets.join(", ")} WHERE id = ? AND workspace_id = ?`)
    .bind(...binds)
    .run();
  if (!res.meta.changes) throw errors.notFound();
  const row = await db.prepare("SELECT * FROM tags WHERE id = ?1 AND workspace_id = ?2").bind(tagId, workspaceId).first<TagRow>();
  if (!row) throw errors.notFound();
  return row;
}

export async function deleteTag(db: D1Database, workspaceId: string, tagId: string): Promise<void> {
  const res = await db.prepare("DELETE FROM tags WHERE id = ?1 AND workspace_id = ?2").bind(tagId, workspaceId).run();
  if (!res.meta.changes) throw errors.notFound();
}

/** 打/解标签：两边都必须属于当前空间（跨租户 id 一律 404） */
export async function attachTag(db: D1Database, workspaceId: string, tagId: string, nodeId: string): Promise<void> {
  const tag = await db.prepare("SELECT 1 AS hit FROM tags WHERE id = ?1 AND workspace_id = ?2").bind(tagId, workspaceId).first();
  if (!tag) throw errors.notFound();
  const node = await db
    .prepare("SELECT 1 AS hit FROM nodes WHERE id = ?1 AND workspace_id = ?2 AND deleted_at IS NULL")
    .bind(nodeId, workspaceId)
    .first();
  if (!node) throw errors.notFound();
  await db
    .prepare("INSERT OR IGNORE INTO node_tags (workspace_id, tag_id, node_id, created_at) VALUES (?1,?2,?3,?4)")
    .bind(workspaceId, tagId, nodeId, Date.now())
    .run();
}

export async function detachTag(db: D1Database, workspaceId: string, tagId: string, nodeId: string): Promise<void> {
  await db
    .prepare("DELETE FROM node_tags WHERE workspace_id = ?1 AND tag_id = ?2 AND node_id = ?3")
    .bind(workspaceId, tagId, nodeId)
    .run();
}

/** 某节点已打的标签（用于标签弹窗回显；节点须属于当前空间） */
export async function listNodeTags(db: D1Database, workspaceId: string, nodeId: string): Promise<TagRow[]> {
  const { results } = await db
    .prepare(
      `SELECT t.* FROM node_tags nt JOIN tags t ON t.id = nt.tag_id
       WHERE nt.workspace_id = ?1 AND nt.node_id = ?2 AND t.workspace_id = ?1 ORDER BY t.name`,
    )
    .bind(workspaceId, nodeId)
    .all<TagRow>();
  return results;
}

export async function listTagNodes(db: D1Database, workspaceId: string, tagId: string): Promise<NodeRow[]> {
  const { results } = await db
    .prepare(
      `SELECT n.* FROM node_tags nt JOIN nodes n ON n.id = nt.node_id
       WHERE nt.workspace_id = ?1 AND nt.tag_id = ?2 AND n.deleted_at IS NULL
       ORDER BY nt.created_at DESC LIMIT 200`,
    )
    .bind(workspaceId, tagId)
    .all<NodeRow>();
  return results;
}
