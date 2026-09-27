import { randomId } from "./crypto";
import { errors } from "./errors";
import type { NodeRow } from "../types";

const now = () => Date.now();

export async function ensureRootDir(db: D1Database, ownerId: string): Promise<NodeRow> {
  // 根目录特征是 name=''（UNIQUE(owner_id,parent_id,name) 保证至多一行），
  // 不能只按 parent_id='' 判断——那会把任何顶层节点误认为根
  const found = await db.prepare("SELECT * FROM nodes WHERE owner_id = ?1 AND parent_id = '' AND name = '' LIMIT 1").bind(ownerId).first<NodeRow>();
  if (found) return found;
  const id = randomId();
  try {
    await db.prepare(
      "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,'','',1,NULL,NULL,NULL,?3,?3,NULL)"
    ).bind(id, ownerId, now()).run();
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) {
      // 并发首次访问：另一个请求已建根目录，幂等复用
      const existing = await db.prepare("SELECT * FROM nodes WHERE owner_id = ?1 AND parent_id = '' AND name = '' LIMIT 1").bind(ownerId).first<NodeRow>();
      if (existing) return existing;
    }
    throw e;
  }
  return (await db.prepare("SELECT * FROM nodes WHERE id = ?1").bind(id).first<NodeRow>())!;
}

export async function getNode(db: D1Database, ownerId: string, id: string): Promise<NodeRow | null> {
  return db.prepare("SELECT * FROM nodes WHERE id = ?1 AND owner_id = ?2").bind(id, ownerId).first<NodeRow>();
}

// 有意不过滤 deleted_at：与 UNIQUE(owner_id,parent_id,name) 约束保持一致，软删除仍占用目录名称
export async function childByName(db: D1Database, ownerId: string, parentId: string, name: string, excludeId?: string): Promise<NodeRow | null> {
  if (excludeId !== undefined) {
    return db.prepare("SELECT * FROM nodes WHERE owner_id = ?1 AND parent_id = ?2 AND name = ?3 AND id != ?4")
      .bind(ownerId, parentId, name, excludeId).first<NodeRow>();
  }
  return db.prepare("SELECT * FROM nodes WHERE owner_id = ?1 AND parent_id = ?2 AND name = ?3").bind(ownerId, parentId, name).first<NodeRow>();
}

// 目录/文件名统一校验：非空、长度、保留名与非法字符，返回 trim 后的名称
export function validateNodeName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) throw errors.badRequest("名称不能为空");
  const n = name.trim();
  if (n.length > 255 || n === "." || n === ".." || /[\\/\x00-\x1f]/.test(n)) throw errors.badRequest("名称不合法");
  return n;
}

export async function createDir(db: D1Database, ownerId: string, parentId: string, name: string): Promise<NodeRow> {
  if (await childByName(db, ownerId, parentId, name)) throw errors.conflict();
  const id = randomId();
  try {
    await db.prepare(
      "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,1,NULL,NULL,NULL,?5,?5,NULL)"
    ).bind(id, ownerId, parentId, name, now()).run();
  } catch (e) {
    // check-then-insert 竞态：并发同名时 UNIQUE 约束兜底，映射为 409
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) throw errors.conflict();
    throw e;
  }
  return (await db.prepare("SELECT * FROM nodes WHERE id = ?1").bind(id).first<NodeRow>())!;
}

export async function listChildren(db: D1Database, ownerId: string, parentId: string): Promise<NodeRow[]> {
  // name != '' 排除根目录哨兵行（其 parent_id 与顶层节点相同）
  const { results } = await db.prepare(
    "SELECT * FROM nodes WHERE owner_id = ?1 AND parent_id = ?2 AND deleted_at IS NULL AND name != '' ORDER BY is_dir DESC, name"
  ).bind(ownerId, parentId).all<NodeRow>();
  return results;
}

export async function breadcrumb(db: D1Database, ownerId: string, dirId: string): Promise<NodeRow[]> {
  const { results } = await db.prepare(`
    WITH RECURSIVE up AS (
      SELECT * FROM nodes WHERE id = ?1 AND owner_id = ?2
      UNION ALL
      SELECT n.* FROM nodes n JOIN up u ON n.id = u.parent_id
    ) SELECT * FROM up WHERE name != ''
  `).bind(dirId, ownerId).all<NodeRow>();
  return results.reverse();
}

export async function uniqueName(db: D1Database, ownerId: string, parentId: string, name: string, excludeId?: string): Promise<string> {
  if (!(await childByName(db, ownerId, parentId, name, excludeId))) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!(await childByName(db, ownerId, parentId, candidate, excludeId))) return candidate;
  }
}

export async function isDescendant(db: D1Database, ownerId: string, ancestorId: string, nodeId: string): Promise<boolean> {
  const { results } = await db.prepare(`
    WITH RECURSIVE sub AS (
      SELECT id FROM nodes WHERE id = ?1 AND owner_id = ?2
      UNION ALL
      SELECT n.id FROM nodes n JOIN sub s ON n.parent_id = s.id
    ) SELECT id FROM sub WHERE id = ?3
  `).bind(ancestorId, ownerId, nodeId).all();
  return results.length > 0;
}

export async function moveNode(db: D1Database, ownerId: string, id: string, newParentId: string, newName: string): Promise<void> {
  const node = await getNode(db, ownerId, id);
  if (!node) throw errors.notFound();
  const parent = newParentId === "" ? await ensureRootDir(db, ownerId) : await getNode(db, ownerId, newParentId);
  if (!parent || !parent.is_dir) throw errors.badRequest("目标目录不存在");
  if (node.is_dir && await isDescendant(db, ownerId, id, newParentId)) throw errors.badRequest("不能移动到自身子目录");
  // 排除自身：改回原名 / no-op PATCH 时不能命中自己
  if (await childByName(db, ownerId, newParentId, newName, id)) throw errors.conflict();
  await db.prepare("UPDATE nodes SET parent_id = ?1, name = ?2, updated_at = ?3 WHERE id = ?4 AND owner_id = ?5")
    .bind(newParentId, newName, now(), id, ownerId).run();
}

export async function subtreeIds(db: D1Database, ownerId: string, rootId: string): Promise<string[]> {
  const { results } = await db.prepare(`
    WITH RECURSIVE sub AS (
      SELECT id FROM nodes WHERE id = ?1 AND owner_id = ?2
      UNION ALL
      SELECT n.id FROM nodes n JOIN sub s ON n.parent_id = s.id
    ) SELECT id FROM sub
  `).bind(rootId, ownerId).all<{ id: string }>();
  return results.map((r) => r.id);
}

export async function usedBytes(db: D1Database, ownerId: string): Promise<number> {
  const row = await db.prepare("SELECT COALESCE(SUM(size),0) AS s FROM nodes WHERE owner_id = ?1 AND deleted_at IS NULL").bind(ownerId).first<{ s: number }>();
  return row!.s;
}

export async function assertQuota(db: D1Database, ownerId: string, extraBytes: number, defaultQuota = 10_737_418_240): Promise<void> {
  const user = await db.prepare("SELECT quota_bytes FROM users WHERE id = ?1").bind(ownerId).first<{ quota_bytes: number }>();
  const used = await usedBytes(db, ownerId);
  if (used + extraBytes > (user?.quota_bytes ?? defaultQuota)) throw errors.quotaExceeded();
}
