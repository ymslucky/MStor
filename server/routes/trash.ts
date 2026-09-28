import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { errors, HttpError } from "../lib/errors";
import { ensureRootDir, getNode, isDescendant, subtreeIds, uniqueName, adjustUsedBytes } from "../lib/nodes";
import { getSetting } from "../lib/settings";

// D1 单语句绑定参数上限 100，IN 子句按分片循环执行
export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, n + i));
  return out;
}

/** 子树内待变更的文件 size 总和：phase='soft' 统计未删除的（软删扣减用），phase='restore' 统计已删除的（还原加回用） */
async function subtreeFileSizeSum(db: D1Database, ownerId: string, rootId: string, phase: "soft" | "restore"): Promise<number> {
  const { results } = await db.prepare(`
    WITH RECURSIVE sub AS (
      SELECT id FROM nodes WHERE id = ?1 AND owner_id = ?2
      UNION ALL SELECT n.id FROM nodes n JOIN sub s ON n.parent_id = s.id
    ) SELECT COALESCE(SUM(size), 0) AS total FROM nodes
      WHERE id IN (SELECT id FROM sub) AND is_dir = 0 AND size IS NOT NULL
      AND deleted_at IS ${phase === "soft" ? "NULL" : "NOT NULL"}
  `).bind(rootId, ownerId).all<{ total: number }>();
  return results[0]?.total ?? 0;
}

export async function softDeleteNode(db: D1Database, ownerId: string, id: string): Promise<void> {
  const node = await getNode(db, ownerId, id);
  if (!node || node.deleted_at) throw errors.notFound();
  // 根目录哨兵行的特征是 parent_id='' 且 name=''；顶层节点 parent_id 同为 ''，只判 parent_id 会误伤
  if (node.parent_id === "" && node.name === "") throw errors.badRequest("不能删除根目录");
  const ids = await subtreeIds(db, ownerId, id);
  const freed = await subtreeFileSizeSum(db, ownerId, id, "soft");
  const now = Date.now();
  // 各分片 + 配额扣减收进一次 batch：软删除原子生效，中途失败不留部分标记
  await db.batch([
    ...chunk(ids, 90).map((part) => {
      const ph = part.map((_, i) => `?${i + 3}`).join(",");
      return db.prepare(`UPDATE nodes SET deleted_at = ?1 WHERE owner_id = ?2 AND deleted_at IS NULL AND id IN (${ph})`)
        .bind(now, ownerId, ...part);
    }),
    db.prepare("UPDATE users SET used_bytes = MAX(0, used_bytes + ?1) WHERE id = ?2").bind(-freed, ownerId),
  ]);
}

export async function permanentDeleteNode(env: Env, ownerId: string, id: string): Promise<void> {
  await permanentDeleteMany(env, ownerId, [id]);
}

/** 多根集合式彻底删除：一次递归 CTE 取所有根的子树闭包，批量删行后并行按引用计数清 R2。
 * 比逐个 permanentDeleteNode 少一个数量级的 D1 往返，批量管理百毫秒级体验的关键。 */
export async function permanentDeleteMany(env: Env, ownerId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const idPh = ids.map((_, i) => `?${i + 2}`).join(",");
  // 校验：只处理回收站内的根；返回实际存在的根数（不存在的 id 静默忽略）
  const { results: roots } = await env.DB.prepare(
    `SELECT id FROM nodes WHERE owner_id = ?1 AND deleted_at IS NOT NULL AND id IN (${idPh})`
  ).bind(ownerId, ...ids).all<{ id: string }>();
  if (!roots.length) return 0;
  const rootIds = roots.map((r) => r.id);
  const rootPh = rootIds.map((_, i) => `?${i + 2}`).join(",");
  // 多根子树闭包：一条递归 CTE 汇总所有根的子孙
  const { results: closure } = await env.DB.prepare(`
    WITH RECURSIVE
    roots AS (SELECT id FROM nodes WHERE owner_id = ?1 AND id IN (${rootPh})),
    sub AS (SELECT id FROM roots UNION ALL SELECT n.id FROM nodes n JOIN sub s ON n.parent_id = s.id)
    SELECT id FROM sub
  `).bind(ownerId, ...rootIds).all<{ id: string }>();
  const all = closure.map((r) => r.id);
  // 收集 r2_key（秒传副本共享同一对象，删行后按引用计数决定是否删对象）
  const r2Keys: string[] = [];
  for (const part of chunk(all, 90)) {
    const ph = part.map((_, i) => `?${i + 1}`).join(",");
    const files = await env.DB.prepare(`SELECT DISTINCT r2_key FROM nodes WHERE id IN (${ph}) AND r2_key IS NOT NULL`)
      .bind(...part).all<{ r2_key: string }>();
    r2Keys.push(...files.results.map((f) => f.r2_key));
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
  await Promise.all([...new Set(r2Keys)].map(async (key) => {
    const ref = await env.DB.prepare("SELECT 1 FROM nodes WHERE r2_key = ?1 LIMIT 1").bind(key).first();
    if (!ref) await env.BUCKET.delete(key);
  }));
  return rootIds.length;
}

/** 多根集合式软删除：一条递归 CTE + 一条 UPDATE 原子标记（排除根目录哨兵行） */
export async function softDeleteMany(db: D1Database, ownerId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const idPh = ids.map((_, i) => `?${i + 2}`).join(",");
  const { results: roots } = await db.prepare(
    `SELECT id, parent_id, name FROM nodes WHERE owner_id = ?1 AND deleted_at IS NULL AND id IN (${idPh})`
  ).bind(ownerId, ...ids).all<{ id: string; parent_id: string; name: string }>();
  // 根目录哨兵行特征 parent_id='' 且 name=''，不可删除
  const valid = roots.filter((r) => !(r.parent_id === "" && r.name === ""));
  if (!valid.length) return 0;
  const validIds = valid.map((r) => r.id);
  const validPh = validIds.map((_, i) => `?${i + 3}`).join(",");
  // 软删扣减配额占用：先统计（行未标记前），与 UPDATE 同 batch 原子生效
  const freedStmt = db.prepare(`
    WITH RECURSIVE
    roots AS (SELECT id FROM nodes WHERE owner_id = ?1 AND id IN (${validIds.map((_, i) => `?${i + 2}`).join(",")})),
    sub AS (SELECT id FROM roots UNION ALL SELECT n.id FROM nodes n JOIN sub s ON n.parent_id = s.id)
    SELECT COALESCE(SUM(size), 0) AS total FROM nodes
    WHERE id IN (SELECT id FROM sub) AND is_dir = 0 AND size IS NOT NULL AND deleted_at IS NULL
  `).bind(ownerId, ...validIds);
  const freedRow = await freedStmt.first<{ total: number }>();
  await db.prepare(`
    WITH RECURSIVE
    roots AS (SELECT id FROM nodes WHERE owner_id = ?1 AND id IN (${validPh})),
    sub AS (SELECT id FROM roots UNION ALL SELECT n.id FROM nodes n JOIN sub s ON n.parent_id = s.id)
    UPDATE nodes SET deleted_at = ?2 WHERE deleted_at IS NULL AND id IN (SELECT id FROM sub)
  `).bind(ownerId, Date.now(), ...validIds).run();
  await adjustUsedBytes(db, ownerId, -(freedRow?.total ?? 0));
  return valid.length;
}

/** 多项集合式移动：目标校验一次、同名冲突一次查、单条 UPDATE 批量改父目录 */
export async function moveMany(db: D1Database, ownerId: string, ids: string[], newParentId: string): Promise<number> {
  if (!ids.length) return 0;
  const parent = newParentId === "" ? await ensureRootDir(db, ownerId) : await getNode(db, ownerId, newParentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  const ph = (start: number) => ids.map((_, i) => `?${start + i}`).join(",");
  const { results: sel } = await db.prepare(
    `SELECT id, name, is_dir FROM nodes WHERE owner_id = ?1 AND deleted_at IS NULL AND id IN (${ph(2)})`
  ).bind(ownerId, ...ids).all<{ id: string; name: string; is_dir: number }>();
  if (!sel.length) return 0;
  // 目录不能移入自身子树：对所选目录逐个做祖先检查（目录数通常极少）
  for (const dir of sel.filter((s) => s.is_dir)) {
    if (await isDescendant(db, ownerId, dir.id, newParentId)) throw errors.badRequest("不能移动到自身子目录");
  }
  // 同名冲突：目标下与所选同名的活跃节点（排除所选自身），任一冲突整批 409
  const names = sel.map((s) => s.name);
  const namePh = names.map(() => "?").join(",");
  const idQ = ids.map(() => "?").join(",");
  const conflict = await db.prepare(
    `SELECT 1 FROM nodes WHERE owner_id = ? AND parent_id = ? AND deleted_at IS NULL AND name IN (${namePh}) AND id NOT IN (${idQ}) LIMIT 1`
  ).bind(ownerId, newParentId, ...names, ...ids).first();
  if (conflict) throw errors.conflict();
  const { meta } = await db.prepare(
    `UPDATE nodes SET parent_id = ?, updated_at = ? WHERE owner_id = ? AND id IN (${idQ})`
  ).bind(newParentId, Date.now(), ownerId, ...ids).run();
  return meta.changes ?? 0;
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
  const parent = node.parent_id === "" ? null : await getNode(db, ownerId, node.parent_id);
  const targetParent = parent && !parent.deleted_at ? node.parent_id : "";
  // 排除自身：节点仍在表内（软删除态），否则 childByName 命中自己导致恢复后变成 "f (2).txt"
  const name = await uniqueName(db, ownerId, targetParent, node.name, node.id);
  const ids = await subtreeIds(db, ownerId, node.id);
  const restored = await subtreeFileSizeSum(db, ownerId, node.id, "restore");
  const statements = [
    ...chunk(ids, 99).map((part) => {
      const ph = part.map((_, i) => `?${i + 2}`).join(",");
      return db.prepare(`UPDATE nodes SET deleted_at = NULL WHERE owner_id = ?1 AND id IN (${ph})`)
        .bind(ownerId, ...part);
    }),
    db.prepare("UPDATE nodes SET parent_id = ?1, name = ?2 WHERE id = ?3")
      .bind(targetParent, name, node.id),
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
