import { randomId } from "./crypto";
import { errors } from "./errors";
import type { NodeRow } from "../types";

const now = () => Date.now();

/** 子节点的物化路径 = 父链 + 父 id（父可为根哨兵行，其 path='/'） */
export function childPath(parent: Pick<NodeRow, "id" | "path">): string {
  return `${parent.path}${parent.id}/`;
}

/** 节点自身子树前缀（含自身的所有后代 path 皆以此开头） */
export function subtreePrefix(node: Pick<NodeRow, "id" | "path">): string {
  return `${node.path}${node.id}/`;
}

/** 子树 path 区间（后代含子节点起全部）：path >= lo AND path < hi。
 * 不用 LIKE 前缀匹配——SQLite LIKE 模式长度上限 50，UUID 深层路径必然超限；
 * 范围扫描可走 (owner_id, path) 索引，id 仅含 [0-9a-f-]，'g' 为哨兵上界。 */
export function subtreeRange(prefix: string): { lo: string; hi: string } {
  return { lo: prefix, hi: `${prefix}g` };
}

export async function ensureRootDir(db: D1Database, ownerId: string): Promise<NodeRow> {
  // 根目录特征是 name=''（UNIQUE(owner_id,parent_id,name) 保证至多一行），
  // 不能只按 parent_id='' 判断——那会把任何顶层节点误认为根
  const found = await db.prepare("SELECT * FROM nodes WHERE owner_id = ?1 AND parent_id = '' AND name = '' LIMIT 1").bind(ownerId).first<NodeRow>();
  if (found) return found;
  const id = randomId();
  try {
    await db.prepare(
      "INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,'','/','',1,NULL,NULL,NULL,?3,?3,NULL)"
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

export async function createDir(db: D1Database, ownerId: string, parentId: string, name: string, parentHint?: NodeRow): Promise<NodeRow> {
  if (await childByName(db, ownerId, parentId, name)) throw errors.conflict();
  // 物化路径需要父行：调用方已持有父行时经 parentHint 传入，避免重复查询
  const parent = parentHint ?? (parentId === "" ? await ensureRootDir(db, ownerId) : await getNode(db, ownerId, parentId));
  if (!parent || !parent.is_dir) throw errors.badRequest("目标目录不存在");
  const id = randomId();
  try {
    await db.prepare(
      "INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,1,NULL,NULL,NULL,?6,?6,NULL)"
    ).bind(id, ownerId, parentId, childPath(parent), name, now()).run();
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
  // 物化路径直接给出祖先 id 链：两次 O(1) 索引查询替代递归 CTE
  const node = await getNode(db, ownerId, dirId);
  if (!node) return [];
  // 面包屑含自身（与原递归 CTE 语义一致）：祖先链 + 自身，按 path 顺序，剔除根哨兵行（name=''）
  const ids = [...node.path.split("/").filter(Boolean), node.id];
  const byId = new Map<string, NodeRow>();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const ph = part.map(() => "?").join(",");
    // 纯 PK 查找（owner_id 条件会让 planner 改走 owner 索引全扫该用户所有行），JS 侧过滤 owner
    const { results } = await db.prepare(`SELECT * FROM nodes WHERE id IN (${ph})`)
      .bind(...part).all<NodeRow>();
    for (const r of results) if (r.owner_id === ownerId) byId.set(r.id, r);
  }
  // 按 path 顺序排列，剔除根哨兵行（name=''）
  return ids.map((id) => byId.get(id)).filter((n): n is NodeRow => !!n && n.name !== "");
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
  // 含自身（nodeId === ancestorId）：与原递归 CTE 语义一致（移动/复制到自身需拒绝）
  if (ancestorId === nodeId) return true;
  // 物化路径前缀比较：一次索引查询替代递归 CTE
  const { results } = await db.prepare(
    "SELECT id, path FROM nodes WHERE owner_id = ?1 AND id IN (?2, ?3)"
  ).bind(ownerId, ancestorId, nodeId).all<{ id: string; path: string }>();
  const a = results.find((r) => r.id === ancestorId);
  const n = results.find((r) => r.id === nodeId);
  if (!a || !n) return false;
  return n.path.startsWith(subtreePrefix(a));
}

export async function moveNode(db: D1Database, ownerId: string, id: string, newParentId: string, newName: string): Promise<void> {
  const node = await getNode(db, ownerId, id);
  if (!node) throw errors.notFound();
  const parent = newParentId === "" ? await ensureRootDir(db, ownerId) : await getNode(db, ownerId, newParentId);
  if (!parent || !parent.is_dir) throw errors.badRequest("目标目录不存在");
  if (node.is_dir && await isDescendant(db, ownerId, id, newParentId)) throw errors.badRequest("不能移动到自身子目录");
  // 排除自身：改回原名 / no-op PATCH 时不能命中自己
  if (await childByName(db, ownerId, newParentId, newName, id)) throw errors.conflict();
  // 物化路径维护：自身一条 UPDATE；目录子树一条前缀批量 UPDATE（替代逐个递归）
  const newSelfPath = childPath(parent);
  const oldPrefix = subtreePrefix(node);
  const newPrefix = `${newSelfPath}${node.id}/`;
  const stmts = [
    db.prepare("UPDATE nodes SET parent_id = ?1, name = ?2, updated_at = ?3, path = ?4 WHERE id = ?5 AND owner_id = ?6")
      .bind(newParentId, newName, now(), newSelfPath, id, ownerId),
  ];
  if (node.is_dir && oldPrefix !== newPrefix) {
    const { lo, hi } = subtreeRange(oldPrefix);
    stmts.push(
      db.prepare("UPDATE nodes SET path = ?1 || substr(path, ?2) WHERE owner_id = ?3 AND path >= ?4 AND path < ?5")
        .bind(newPrefix, oldPrefix.length + 1, ownerId, lo, hi),
    );
  }
  await db.batch(stmts);
}

export async function subtreeIds(db: D1Database, ownerId: string, rootId: string): Promise<string[]> {
  // 物化路径范围扫描（含自身）替代递归 CTE
  const node = await getNode(db, ownerId, rootId);
  if (!node) return [];
  const { lo, hi } = subtreeRange(subtreePrefix(node));
  const { results } = await db.prepare(
    "SELECT id FROM nodes WHERE owner_id = ?1 AND (id = ?2 OR (path >= ?3 AND path < ?4))"
  ).bind(ownerId, rootId, lo, hi).all<{ id: string }>();
  return results.map((r) => r.id);
}

/** 配额占用读 users.used_bytes 冗余列（O(1)），不再 SUM 全表扫描。
 * 写入点（上传/秒传/覆盖/软删/还原）同步增减，cron 每日校准兜底。 */
export async function usedBytes(db: D1Database, ownerId: string): Promise<number> {
  const row = await db.prepare("SELECT used_bytes FROM users WHERE id = ?1").bind(ownerId).first<{ used_bytes: number }>();
  return row?.used_bytes ?? 0;
}

/** 同步调整配额占用（delta 可负）；MAX(0,...) 防御历史数据漂移导致负值 */
export async function adjustUsedBytes(db: D1Database, ownerId: string, delta: number): Promise<void> {
  if (!delta) return;
  await db.prepare("UPDATE users SET used_bytes = MAX(0, used_bytes + ?1) WHERE id = ?2").bind(delta, ownerId).run();
}

export async function assertQuota(db: D1Database, ownerId: string, extraBytes: number, defaultQuota = 10_737_418_240): Promise<void> {
  const user = await db.prepare("SELECT quota_bytes, used_bytes FROM users WHERE id = ?1").bind(ownerId).first<{ quota_bytes: number; used_bytes: number }>();
  if ((user?.used_bytes ?? 0) + extraBytes > (user?.quota_bytes ?? defaultQuota)) throw errors.quotaExceeded();
}
