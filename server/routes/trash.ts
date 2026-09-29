import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { errors, HttpError } from "../lib/errors";
import { childPath, ensureRootDir, getNode, isDescendant, resolveParent, subtreePrefix, subtreeRange, uniqueName, adjustUsedBytes } from "../lib/nodes";
import type { NodeRow } from "../types";
import { getSetting } from "../lib/settings";

// D1 单语句绑定参数上限 100，IN 子句按分片循环执行
export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, n + i));
  return out;
}

/** 子树内待变更的文件 size 总和：phase='soft' 统计未删除的（软删扣减用），phase='restore' 统计已删除的（还原加回用）。
 * 物化路径范围扫描（含自身）替代递归 CTE。 */
async function subtreeFileSizeSum(db: D1Database, ownerId: string, node: NodeRow, phase: "soft" | "restore"): Promise<number> {
  const { lo, hi } = subtreeRange(subtreePrefix(node));
  const { results } = await db.prepare(`
    SELECT COALESCE(SUM(size), 0) AS total FROM nodes
    WHERE owner_id = ?1 AND is_dir = 0 AND size IS NOT NULL
    AND deleted_at IS ${phase === "soft" ? "NULL" : "NOT NULL"}
    AND (id = ?2 OR (path >= ?3 AND path < ?4))
  `).bind(ownerId, node.id, lo, hi).all<{ total: number }>();
  return results[0]?.total ?? 0;
}

/** 多根「自身或后代」条件的 SQL 片段：每根消耗 3 个绑定参数（id + 区间 lo/hi），调用方按 ≤30 根/语句分片 */
function subtreeTerms(roots: NodeRow[]): string {
  return roots.map(() => `(id = ? OR (path >= ? AND path < ?))`).join(" OR ");
}

/** 多根条件绑定值：id + subtreeRange 哨兵区间 */
function subtreeBinds(roots: NodeRow[]): string[] {
  return roots.flatMap((r) => [r.id, ...Object.values(subtreeRange(subtreePrefix(r)))]);
}

export async function softDeleteNode(db: D1Database, ownerId: string, id: string): Promise<void> {
  const node = await getNode(db, ownerId, id);
  if (!node || node.deleted_at) throw errors.notFound();
  // 根目录哨兵行是唯一 name='' 的行（真实节点名经 validateNodeName 非空）
  if (node.name === "") throw errors.badRequest("不能删除根目录");
  const now = Date.now();
  // 物化路径：子树（含自身）一条 UPDATE + 配额扣减收进一次 batch，软删除原子生效
  const { lo, hi } = subtreeRange(subtreePrefix(node));
  await db.batch([
    db.prepare(`UPDATE nodes SET deleted_at = ?1 WHERE owner_id = ?2 AND deleted_at IS NULL AND (id = ?3 OR (path >= ?4 AND path < ?5))`)
      .bind(now, ownerId, node.id, lo, hi),
    db.prepare("UPDATE users SET used_bytes = MAX(0, used_bytes + ?1) WHERE id = ?2").bind(
      -(await subtreeFileSizeSum(db, ownerId, node, "soft")), ownerId),
  ]);
}

export async function permanentDeleteNode(env: Env, ownerId: string, id: string): Promise<void> {
  await permanentDeleteMany(env, ownerId, [id]);
}

/** 多根集合式彻底删除：物化路径前缀扫描取所有根的子树闭包（id + r2_key），
 * 批量删行后并行按引用计数清 R2。比逐个 permanentDeleteNode 少一个数量级的 D1 往返。 */
export async function permanentDeleteMany(env: Env, ownerId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  // 校验：只处理回收站内的根；返回实际存在的根数（不存在的 id 静默忽略）
  const roots: NodeRow[] = [];
  for (const part of chunk(ids, 90)) {
    const ph = part.map((_, i) => `?${i + 1}`).join(",");
    // 纯 PK 查找（避免 owner 索引全扫），JS 侧过滤 owner
    const { results } = await env.DB.prepare(
      `SELECT * FROM nodes WHERE deleted_at IS NOT NULL AND id IN (${ph})`
    ).bind(...part).all<NodeRow>();
    roots.push(...results.filter((r) => r.owner_id === ownerId));
  }
  if (!roots.length) return 0;
  // 多根子树闭包：范围扫描同时取 id 和 r2_key（秒传副本共享同一对象，删行后按引用计数决定是否删对象）。
  // 每根消耗 3 个绑定参数（id + 区间），按 30 根/语句分片
  const all: string[] = [];
  const r2Keys = new Set<string>();
  for (const part of chunk(roots, 30)) {
    const clause = subtreeTerms(part);
    const { results } = await env.DB.prepare(
      `SELECT id, r2_key FROM nodes WHERE owner_id = ?1 AND (${clause})`
    ).bind(ownerId, ...subtreeBinds(part)).all<{ id: string; r2_key: string | null }>();
    for (const r of results) {
      all.push(r.id);
      if (r.r2_key) r2Keys.add(r.r2_key);
    }
  }
  // 删行：shares + nodes 分片 batch，行删除后未删的秒传副本仍在引用计数里
  for (const part of chunk(all, 90)) {
    const ph = part.map((_, i) => `?${i + 1}`).join(",");
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM shares WHERE node_id IN (${ph})`).bind(...part),
      env.DB.prepare(`DELETE FROM nodes WHERE id IN (${ph})`).bind(...part),
    ]);
  }
  // R2 并行清理：每个 key 查一次剩余引用，零引用才删对象（并行把 20+ 次 R2 往返压到一次往返时间）
  await Promise.all([...r2Keys].map(async (key) => {
    const ref = await env.DB.prepare("SELECT 1 FROM nodes WHERE r2_key = ?1 LIMIT 1").bind(key).first();
    if (!ref) await env.BUCKET.delete(key);
  }));
  return roots.length;
}

/** 多根集合式软删除：物化路径范围扫描 + 一条 UPDATE 原子标记（排除根目录哨兵行），
 * 每根消耗 3 个绑定参数，按 30 根/语句分片 */
export async function softDeleteMany(db: D1Database, ownerId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  // 纯 PK 查找（避免 owner 索引全扫），JS 侧过滤 owner
  const { results: selRows } = await db.prepare(
    `SELECT * FROM nodes WHERE deleted_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`
  ).bind(...ids).all<NodeRow>();
  const sel = selRows.filter((r) => r.owner_id === ownerId);
  // 根目录哨兵行（name=''）不可删除
  const valid = sel.filter((r) => r.name !== "");
  if (!valid.length) return 0;
  const now = Date.now();
  let freed = 0;
  for (const part of chunk(valid, 30)) {
    const clause = subtreeTerms(part);
    const binds = subtreeBinds(part);
    // 软删扣减配额占用：先统计（行未标记前），UPDATE 原子标记
    const sumRow = await db.prepare(`
      SELECT COALESCE(SUM(size), 0) AS total FROM nodes
      WHERE owner_id = ?1 AND is_dir = 0 AND size IS NOT NULL AND deleted_at IS NULL AND (${clause})
    `).bind(ownerId, ...binds).first<{ total: number }>();
    freed += sumRow?.total ?? 0;
    await db.prepare(`UPDATE nodes SET deleted_at = ?1 WHERE owner_id = ?2 AND deleted_at IS NULL AND (${clause})`)
      .bind(now, ownerId, ...binds).run();
  }
  await adjustUsedBytes(db, ownerId, -freed);
  return valid.length;
}

/** 多项集合式移动：目标校验一次、同名冲突一次查、分片 UPDATE 批量改父目录；
 * 所选目录的子树路径用一条前缀 UPDATE 平移 */
export async function moveMany(db: D1Database, ownerId: string, ids: string[], newParentId: string): Promise<number> {
  if (!ids.length) return 0;
  // '' 表示根 → 根哨兵行，DB parent_id 用哨兵行 id
  const parent = await resolveParent(db, ownerId, newParentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  const targetParentId = parent.id;
  // 纯 PK 查找（避免 owner 索引全扫），JS 侧过滤 owner
  const { results: selRows } = await db.prepare(
    `SELECT * FROM nodes WHERE deleted_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`
  ).bind(...ids).all<NodeRow>();
  const sel = selRows.filter((r) => r.owner_id === ownerId);
  if (!sel.length) return 0;
  // 目录不能移入自身子树：对所选目录做祖先检查（目录数通常极少）
  for (const dir of sel.filter((s) => s.is_dir)) {
    if (await isDescendant(db, ownerId, dir.id, targetParentId)) throw errors.badRequest("不能移动到自身子目录");
  }
  // 同名冲突：目标下与所选同名的活跃节点（排除所选自身），任一冲突整批 409
  const names = sel.map((s) => s.name);
  const namePh = names.map(() => "?").join(",");
  const idQ = ids.map(() => "?").join(",");
  const conflict = await db.prepare(
    `SELECT 1 FROM nodes WHERE owner_id = ? AND parent_id = ? AND deleted_at IS NULL AND name IN (${namePh}) AND id NOT IN (${idQ}) LIMIT 1`
  ).bind(ownerId, targetParentId, ...names, ...ids).first();
  if (conflict) throw errors.conflict();
  const now = Date.now();
  const parentPath = childPath(parent);
  // 每个被移动节点自身的 path = 目标父路径（祖先链，不含自身），逐节点 UPDATE
  const stmts = sel.map((s) =>
    db.prepare("UPDATE nodes SET parent_id = ?1, updated_at = ?2, path = ?3 WHERE owner_id = ?4 AND id = ?5")
      .bind(targetParentId, now, parentPath, ownerId, s.id),
  );
  // 目录子树路径前缀平移（一条 UPDATE 搞定整个子树）
  for (const dir of sel.filter((s) => s.is_dir)) {
    const oldPrefix = subtreePrefix(dir);
    const newPrefix = `${parentPath}${dir.id}/`;
    if (oldPrefix !== newPrefix) {
      const { lo, hi } = subtreeRange(oldPrefix);
      stmts.push(db.prepare("UPDATE nodes SET path = ?1 || substr(path, ?2) WHERE owner_id = ?3 AND path >= ?4 AND path < ?5")
        .bind(newPrefix, oldPrefix.length + 1, ownerId, lo, hi));
    }
  }
  await db.batch(stmts);
  return sel.length;
}

export async function purgeExpiredTrash(env: Env): Promise<void> {
  // 保留天数：admin 设置页动态配置优先，未配置回退 env
  const configured = await getSetting(env, "trash_retention_days");
  const days = Number(configured ?? env.TRASH_RETENTION_DAYS);
  const cutoff = Date.now() - days * 86400000;
  const { results } = await env.DB.prepare(
    "SELECT id, owner_id FROM nodes WHERE deleted_at IS NOT NULL AND deleted_at < ?1"
  ).bind(cutoff).all<{ id: string; owner_id: string }>();
  for (const r of results) {
    try {
      await permanentDeleteNode(env, r.owner_id, r.id);
    } catch (e) {
      // 子树随父目录删除后，子行再被轮到时 404 属预期；其余失败告警但不阻断整轮清理
      if (e instanceof HttpError && e.status === 404) continue;
      console.warn("purgeExpiredTrash: 清理节点失败", r.id, e);
    }
  }
}

export const trash = new Hono<AppEnv>();

trash.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM nodes WHERE owner_id = ?1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500"
  ).bind(c.get("user").id).all();
  return c.json({ nodes: results });
});

// 从路由提取的可复用还原逻辑：单项失败抛 HttpError（404 未找到 / 409 并发同名冲突）
export async function restoreTrashNode(db: D1Database, ownerId: string, id: string): Promise<void> {
  const node = await getNode(db, ownerId, id);
  if (!node || !node.deleted_at) throw errors.notFound();
  // 目标父目录：原父仍活跃则原地还原，否则还原到根（parent_id 统一为哨兵行 id）
  let targetParent = await getNode(db, ownerId, node.parent_id);
  if (!targetParent || targetParent.deleted_at) targetParent = await ensureRootDir(db, ownerId);
  const targetParentId = targetParent.id;
  // 排除自身：节点仍在表内（软删除态），否则 childByName 命中自己导致恢复后变成 "f (2).txt"
  const name = await uniqueName(db, ownerId, targetParentId, node.name, node.id);
  // 父目录已被删时还原到根：物化路径需重算，子树前缀随之平移
  let newPath = node.path;
  if (targetParentId !== node.parent_id) {
    newPath = childPath(targetParent);
  }
  const oldPrefix = subtreePrefix(node);
  const newPrefix = `${newPath}${node.id}/`;
  const restored = await subtreeFileSizeSum(db, ownerId, node, "restore");
  const { lo, hi } = subtreeRange(oldPrefix);
  const statements = [
    db.prepare("UPDATE nodes SET deleted_at = NULL WHERE owner_id = ?1 AND (id = ?2 OR (path >= ?3 AND path < ?4))")
      .bind(ownerId, node.id, lo, hi),
    db.prepare("UPDATE nodes SET parent_id = ?1, name = ?2, path = ?3, updated_at = ?4 WHERE id = ?5")
      .bind(targetParentId, name, newPath, Date.now(), node.id),
    ...(node.is_dir && oldPrefix !== newPrefix
      ? [db.prepare("UPDATE nodes SET path = ?1 || substr(path, ?2) WHERE owner_id = ?3 AND path >= ?4 AND path < ?5")
          .bind(newPrefix, oldPrefix.length + 1, ownerId, lo, hi)]
      : []),
    db.prepare("UPDATE users SET used_bytes = MAX(0, used_bytes + ?1) WHERE id = ?2").bind(restored, ownerId),
  ];
  try {
    await db.batch(statements);
  } catch (e) {
    // uniqueName 与 batch 之间并发同名恢复撞 UNIQUE：映射 409（与 createDir 惯例一致）
    if (!(e instanceof Error && e.message.includes("UNIQUE constraint failed"))) throw e;
    throw errors.conflict();
  }
}

// 批量请求体校验：非空字符串数组、≤500（与列表上限一致）；shares 批量撤销复用
export function parseIds(body: { ids?: unknown }): string[] {
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || ids.some((id) => typeof id !== "string" || !id)) {
    throw errors.badRequest("ids 必须为 1-500 个节点 id");
  }
  return ids;
}

trash.post("/batch-restore", async (c) => {
  const ids = parseIds(await c.req.json());
  const user = c.get("user");
  let restored = 0;
  const failed: { id: string; reason: string }[] = [];
  for (const id of ids) {
    try {
      await restoreTrashNode(c.env.DB, user.id, id);
      restored++;
    } catch (e) {
      // 单项失败不阻断其余项（如并发同名 409、id 不存在 404）
      failed.push({ id, reason: e instanceof Error ? e.message : "未知错误" });
    }
  }
  return c.json({ ok: true, restored, failed });
});

trash.post("/batch-purge", async (c) => {
  const ids = parseIds(await c.req.json());
  const user = c.get("user");
  const purged = await permanentDeleteMany(c.env, user.id, ids);
  return c.json({ ok: true, purged, failed: [] });
});

trash.post("/:id/restore", async (c) => {
  await restoreTrashNode(c.env.DB, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});

trash.delete("/:id", async (c) => {
  await permanentDeleteNode(c.env, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
