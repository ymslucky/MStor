
import type { Env } from "../env";
import { errors, HttpError } from "../lib/errors";
import { childPath, ensureRootDir, getNode, isDescendant, resolveParent, subtreePrefix, subtreeRange, uniqueName } from "../lib/nodes";
import { chunk, DIRS_PER_STMT, NODES_PK_INDEX, isUniqueViolation, jsonList, jsonSet } from "../lib/sql";
import { recomputeStorageStatsStmt } from "./storage";
import type { NodeRow } from "../types";
import { getSetting } from "../lib/settings";

/** 子树内待变更的文件 size 总和：phase='soft' 统计未删除的（软删扣减用），phase='restore' 统计已删除的（还原加回用）。
 * 物化路径范围扫描（含自身）替代递归 CTE。 */
async function subtreeFileSizeSum(db: D1Database, workspaceId: string, node: NodeRow, phase: "soft" | "restore"): Promise<number> {
  const { lo, hi } = subtreeRange(subtreePrefix(node));
  const { results } = await db.prepare(`
    SELECT COALESCE(SUM(size), 0) AS total FROM nodes
    WHERE workspace_id = ?1 AND is_dir = 0 AND size IS NOT NULL
    AND deleted_at IS ${phase === "soft" ? "NULL" : "NOT NULL"}
    AND (id = ?2 OR (path >= ?3 AND path < ?4))
  `).bind(workspaceId, node.id, lo, hi).all<{ total: number }>();
  return results[0]?.total ?? 0;
}
export async function softDeleteNode(db: D1Database, workspaceId: string, id: string): Promise<void> {
  const node = await getNode(db, workspaceId, id);
  if (!node || node.deleted_at) throw errors.notFound();
  // 根目录哨兵行是唯一 name='' 的行（真实节点名经 validateNodeName 非空）
  if (node.name === "") throw errors.badRequest("不能删除根目录");
  const now = Date.now();
  // 物化路径：子树（含自身）一条 UPDATE + 配额扣减收进一次 batch，软删除原子生效
  const { lo, hi } = subtreeRange(subtreePrefix(node));
  await db.batch([
    db.prepare(`UPDATE nodes SET deleted_at = ?1 WHERE workspace_id = ?2 AND deleted_at IS NULL AND (id = ?3 OR (path >= ?4 AND path < ?5))`)
      .bind(now, workspaceId, node.id, lo, hi),
    db.prepare("UPDATE workspaces SET used_bytes = MAX(0, used_bytes + ?1) WHERE id = ?2").bind(
      -(await subtreeFileSizeSum(db, workspaceId, node, "soft")), workspaceId),
  ]);
}

export async function permanentDeleteNode(env: Env, workspaceId: string, id: string): Promise<void> {
  await permanentDeleteMany(env, workspaceId, [id]);
}

/** 多根集合式彻底删除：物化路径前缀扫描取所有根的子树闭包（id + r2_key），
 * 批量删行后并行按引用计数清 R2。比逐个 permanentDeleteNode 少一个数量级的 D1 往返。 */
export async function permanentDeleteMany(env: Env, workspaceId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  // 校验：只处理回收站内的根（owner 过滤在 SQL 内，不再拉回 JS 过滤）
  const { results: roots } = await env.DB.prepare(
    `SELECT id, path, is_dir FROM nodes INDEXED BY ${NODES_PK_INDEX} WHERE workspace_id = ?1 AND deleted_at IS NOT NULL AND id IN ${jsonSet()}`
  ).bind(workspaceId, jsonList(ids)).all<Pick<NodeRow, "id" | "path" | "is_dir">>();
  if (!roots.length) return 0;
  // 闭包：自身 id（json_each 单参数）+ 目录区间（每条目录 2 参数），全部读取合并成一次 batch
  const selects: D1PreparedStatement[] = [
    env.DB.prepare(
      `SELECT id, r2_key FROM nodes INDEXED BY ${NODES_PK_INDEX} WHERE workspace_id = ?1 AND id IN ${jsonSet()}`
    ).bind(workspaceId, jsonList(roots.map((r) => r.id))),
  ];
  for (const part of chunk(roots.filter((r) => r.is_dir), DIRS_PER_STMT)) {
    const ranges = part.flatMap((d) => {
      const { lo, hi } = subtreeRange(subtreePrefix(d));
      return [lo, hi];
    });
    const clause = `id IN ${jsonSet()} OR ${part.map(() => "(path >= ? AND path < ?)").join(" OR ")}`;
    selects.push(
      env.DB.prepare(`SELECT id, r2_key FROM nodes WHERE workspace_id = ?1 AND (${clause})`)
        .bind(workspaceId, jsonList(part.map((d) => d.id)), ...ranges),
    );
  }
  const readResults = await env.DB.batch(selects);
  const all: string[] = [];
  const r2Keys = new Set<string>();
  for (const result of readResults) {
    for (const row of result.results as { id: string; r2_key: string | null }[]) {
      all.push(row.id);
      if (row.r2_key) r2Keys.add(row.r2_key);
    }
  }
  // 删行 + 孤儿登记：同一个 batch（一次往返、原子）。
  // R2 清理仍交给定时任务「延迟 + 二次引用检查」：并发秒传可能已按 sha256 查到该 key 但尚未插行，
  // 此刻直接删对象会留下悬空引用（TOCTOU），所以这里只登记候选 key。
  const now = Date.now();
  const writes: D1PreparedStatement[] = [];
  for (const part of chunk([...new Set(all)], 5000)) {
    const partJson = jsonList(part);
    writes.push(
      env.DB.prepare(`DELETE FROM shares WHERE node_id IN ${jsonSet()}`).bind(partJson),
      env.DB.prepare(`DELETE FROM nodes WHERE id IN ${jsonSet()}`).bind(partJson),
    );
  }
  if (r2Keys.size) {
    for (const part of chunk([...r2Keys], 5000)) {
      writes.push(
        env.DB.prepare("INSERT OR REPLACE INTO orphan_objects (r2_key, queued_at) SELECT value, ? FROM json_each(?)")
          .bind(now, jsonList(part)),
      );
    }
  }
  await env.DB.batch(writes);
  return roots.length;
}

/** 孤儿对象清扫宽限期：登记后延迟复查引用，避开并发秒传「查到 key 后才插行」的 TOCTOU 窗口 */
export const ORPHAN_GRACE_MS = 60 * 60 * 1000;

/** 定时清扫孤儿 R2 对象：宽限期后复查仍无任何节点引用才删除，有引用的仅出队。
 * 返回实际删除的对象数；graceMs 可注入（测试传 0 立即清扫）。 */
export async function sweepOrphanObjects(env: Env, graceMs: number = ORPHAN_GRACE_MS): Promise<number> {
  const cutoff = Date.now() - graceMs;
  // 一条查询同时取出待清扫 key 与引用计数（原实现是 per-key 两条语句，500 个 key 就是约 1000 条）
  const { results } = await env.DB.prepare(`
    SELECT o.r2_key, (SELECT COUNT(*) FROM nodes n WHERE n.r2_key = o.r2_key) AS refs
    FROM orphan_objects o WHERE o.queued_at < ?1 LIMIT 500
  `).bind(cutoff).all<{ r2_key: string; refs: number }>();
  if (!results.length) return 0;
  const dead = results.filter((r) => r.refs === 0).map((r) => r.r2_key);
  // R2 侧一次批量删除（≤1000 key/次）
  if (dead.length) await env.BUCKET.delete(dead);
  // 出队：处理过的 key 全部出队（有引用的说明已被复用，无需继续跟踪），一条语句
  await env.DB.prepare(`DELETE FROM orphan_objects WHERE r2_key IN ${jsonSet()}`)
    .bind(jsonList(results.map((r) => r.r2_key))).run();
  return dead.length;
}

/** 多根集合式软删除：物化路径范围扫描 + 一条 UPDATE 原子标记（排除根目录哨兵行），
 * 每根消耗 3 个绑定参数，按 30 根/语句分片 */
export async function softDeleteMany(db: D1Database, workspaceId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  // 选中项一次查全（json_each 单参数，任意长度）；owner 过滤在 SQL 内完成
  const { results: rows } = await db.prepare(
    `SELECT id, name, is_dir, path FROM nodes INDEXED BY ${NODES_PK_INDEX} WHERE workspace_id = ?1 AND deleted_at IS NULL AND id IN ${jsonSet()}`
  ).bind(workspaceId, jsonList(ids)).all<Pick<NodeRow, "id" | "name" | "is_dir" | "path">>();
  // 根目录哨兵行（name=''）不可删除
  const valid = rows.filter((r) => r.name !== "");
  if (!valid.length) return 0;
  const now = Date.now();
  // 被选中目录的后代由区间语句覆盖，不能重复计入配额（否则 used_bytes 被多扣）。
  // 先剔除"落在其他选中目录子树内"的项，配额子查询之间因此互不重叠。
  const dirPrefixes = valid.filter((r) => r.is_dir).map((r) => subtreePrefix(r));
  const own = valid.filter((n) => !dirPrefixes.some((p) => n.path.startsWith(p)));
  const ownJson = jsonList(own.map((n) => n.id));
  const ownedDirs = own.filter((n) => n.is_dir);
  // 配额扣减语句：子查询在 batch 内先于标记执行，统计到的仍是未删除行
  const quotaStmt = (predicate: string) =>
    db.prepare(`UPDATE workspaces SET used_bytes = MAX(0, used_bytes - (
        SELECT COALESCE(SUM(size), 0) FROM nodes
        WHERE workspace_id = ?1 AND is_dir = 0 AND size IS NOT NULL AND deleted_at IS NULL AND (${predicate})
      )) WHERE id = ?1`);
  const stmts: D1PreparedStatement[] = [
    quotaStmt(`id IN ${jsonSet()}`).bind(workspaceId, ownJson),
    db.prepare(`UPDATE nodes SET deleted_at = ? WHERE workspace_id = ? AND deleted_at IS NULL AND id IN ${jsonSet()}`)
      .bind(now, workspaceId, ownJson),
  ];
  for (const part of chunk(ownedDirs, DIRS_PER_STMT)) {
    // 子树谓词：自身 id（json_each 单参数）或区间（每条目录 2 个参数）
    const ranges = part.flatMap((d) => {
      const { lo, hi } = subtreeRange(subtreePrefix(d));
      return [lo, hi];
    });
    const clause = `id IN ${jsonSet()} OR ${part.map(() => "(path >= ? AND path < ?)").join(" OR ")}`;
    const partJson = jsonList(part.map((d) => d.id));
    stmts.push(
      quotaStmt(clause).bind(workspaceId, partJson, ...ranges),
      db.prepare(`UPDATE nodes SET deleted_at = ? WHERE workspace_id = ? AND deleted_at IS NULL AND (${clause})`)
        .bind(now, workspaceId, partJson, ...ranges),
    );
  }
  await db.batch(stmts);
  return valid.length;
}

/** 多项集合式移动：目标校验一次、同名冲突一次查、分片 UPDATE 批量改父目录；
 * 所选目录的子树路径用一条前缀 UPDATE 平移 */
export async function moveMany(db: D1Database, workspaceId: string, ids: string[], newParentId: string): Promise<number> {
  if (!ids.length) return 0;
  // '' 表示根 → 根哨兵行，DB parent_id 用哨兵行 id
  const parent = await resolveParent(db, workspaceId, newParentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  const targetParentId = parent.id;
  // 一次查全（json_each 单参数，任意长度）；owner 过滤在 SQL 内完成
  const { results: sel } = await db.prepare(
    `SELECT * FROM nodes INDEXED BY ${NODES_PK_INDEX} WHERE workspace_id = ?1 AND deleted_at IS NULL AND id IN ${jsonSet()}`
  ).bind(workspaceId, jsonList(ids)).all<NodeRow>();
  if (!sel.length) return 0;
  // 目录不能移入自身子树：对所选目录做祖先检查（目录数通常极少）
  for (const dir of sel.filter((s) => s.is_dir)) {
    if (await isDescendant(db, workspaceId, dir.id, targetParentId)) throw errors.badRequest("不能移动到自身子目录");
  }
  // 同名冲突：目标下与所选同名的活跃节点，任一冲突整批 409。
  // 只按 name 绑定（2 + 90/片），命中后用 JS 排除所选自身——原 `id NOT IN (…ids)` 写法把参数放大到
  // 2 + names + ids，约 50 项批量移动即超 D1 上限（too many SQL variables）整体 500
  const idSet = new Set(sel.map((s) => s.id));
  {
    const { results } = await db.prepare(
      `SELECT id FROM nodes WHERE workspace_id = ?1 AND parent_id = ?2 AND deleted_at IS NULL AND name IN ${jsonSet()}`
    ).bind(workspaceId, targetParentId, jsonList(sel.map((s) => s.name))).all<{ id: string }>();
    if (results.some((r) => !idSet.has(r.id))) throw errors.conflict();
  }
  const now = Date.now();
  const parentPath = childPath(parent);
  // 每个被移动节点自身的 path = 目标父路径（祖先链，不含自身），逐节点 UPDATE
  const stmts = sel.map((s) =>
    db.prepare("UPDATE nodes SET parent_id = ?1, updated_at = ?2, path = ?3 WHERE workspace_id = ?4 AND id = ?5")
      .bind(targetParentId, now, parentPath, workspaceId, s.id),
  );
  // 目录子树路径前缀平移（一条 UPDATE 搞定整个子树）
  for (const dir of sel.filter((s) => s.is_dir)) {
    const oldPrefix = subtreePrefix(dir);
    const newPrefix = `${parentPath}${dir.id}/`;
    if (oldPrefix !== newPrefix) {
      const { lo, hi } = subtreeRange(oldPrefix);
      stmts.push(db.prepare("UPDATE nodes SET path = ?1 || substr(path, ?2) WHERE workspace_id = ?3 AND path >= ?4 AND path < ?5")
        .bind(newPrefix, oldPrefix.length + 1, workspaceId, lo, hi));
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
    "SELECT id, workspace_id FROM nodes WHERE deleted_at IS NOT NULL AND deleted_at < ?1"
  ).bind(cutoff).all<{ id: string; workspace_id: string }>();
  for (const r of results) {
    try {
      await permanentDeleteNode(env, r.workspace_id, r.id);
    } catch (e) {
      // 子树随父目录删除后，子行再被轮到时 404 属预期；其余失败告警但不阻断整轮清理
      if (e instanceof HttpError && e.status === 404) continue;
      console.warn("purgeExpiredTrash: 清理节点失败", r.id, e);
    }
  }
  // 清理后按 workspace 重算四分项（租户数有界，一次 batch）
  const { results: wsRows } = await env.DB.prepare("SELECT id FROM workspaces").all<{ id: string }>();
  if (wsRows.length) await env.DB.batch(wsRows.map((w) => recomputeStorageStatsStmt(env.DB, w.id)));
}

export async function restoreTrashNode(db: D1Database, workspaceId: string, id: string): Promise<void> {
  const node = await getNode(db, workspaceId, id);
  if (!node || !node.deleted_at) throw errors.notFound();
  // 目标父目录：原父仍活跃则原地还原，否则还原到根（parent_id 统一为哨兵行 id）
  let targetParent = await getNode(db, workspaceId, node.parent_id);
  if (!targetParent || targetParent.deleted_at) targetParent = await ensureRootDir(db, workspaceId);
  const targetParentId = targetParent.id;
  // 排除自身：节点仍在表内（软删除态），否则 childByName 命中自己导致恢复后变成 "f (2).txt"
  const name = await uniqueName(db, workspaceId, targetParentId, node.name, node.id);
  // 父目录已被删时还原到根：物化路径需重算，子树前缀随之平移
  let newPath = node.path;
  if (targetParentId !== node.parent_id) {
    newPath = childPath(targetParent);
  }
  const oldPrefix = subtreePrefix(node);
  const newPrefix = `${newPath}${node.id}/`;
  const restored = await subtreeFileSizeSum(db, workspaceId, node, "restore");
  const { lo, hi } = subtreeRange(oldPrefix);
  const statements = [
    db.prepare("UPDATE nodes SET deleted_at = NULL WHERE workspace_id = ?1 AND (id = ?2 OR (path >= ?3 AND path < ?4))")
      .bind(workspaceId, node.id, lo, hi),
    db.prepare("UPDATE nodes SET parent_id = ?1, name = ?2, path = ?3, updated_at = ?4 WHERE id = ?5")
      .bind(targetParentId, name, newPath, Date.now(), node.id),
    ...(node.is_dir && oldPrefix !== newPrefix
      ? [db.prepare("UPDATE nodes SET path = ?1 || substr(path, ?2) WHERE workspace_id = ?3 AND path >= ?4 AND path < ?5")
          .bind(newPrefix, oldPrefix.length + 1, workspaceId, lo, hi)]
      : []),
    db.prepare("UPDATE workspaces SET used_bytes = MAX(0, used_bytes + ?1) WHERE id = ?2").bind(restored, workspaceId),
  ];
  try {
    await db.batch(statements);
  } catch (e) {
    // uniqueName 与 batch 之间并发同名恢复撞 UNIQUE：映射 409（与 createDir 惯例一致）
    if (!isUniqueViolation(e)) throw e;
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