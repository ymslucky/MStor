import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { errors, HttpError } from "../lib/errors";
import { getNode, subtreeIds, uniqueName } from "../lib/nodes";

// D1 单语句绑定参数上限 100，IN 子句按分片循环执行
export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, n + i));
  return out;
}

export async function softDeleteNode(db: D1Database, ownerId: string, id: string): Promise<void> {
  const node = await getNode(db, ownerId, id);
  if (!node || node.deleted_at) throw errors.notFound();
  // 根目录哨兵行的特征是 parent_id='' 且 name=''；顶层节点 parent_id 同为 ''，只判 parent_id 会误伤
  if (node.parent_id === "" && node.name === "") throw errors.badRequest("不能删除根目录");
  const ids = await subtreeIds(db, ownerId, id);
  const now = Date.now();
  // 各分片收进一次 batch：软删除原子生效，中途失败不留部分标记
  await db.batch(chunk(ids, 90).map((part) => {
    const ph = part.map((_, i) => `?${i + 3}`).join(",");
    return db.prepare(`UPDATE nodes SET deleted_at = ?1 WHERE owner_id = ?2 AND deleted_at IS NULL AND id IN (${ph})`)
      .bind(now, ownerId, ...part);
  }));
}

export async function permanentDeleteNode(env: Env, ownerId: string, id: string): Promise<void> {
  // 仅回收站内的节点可彻底删除（活跃节点走软删除）
  const node = await getNode(env.DB, ownerId, id);
  if (!node || !node.deleted_at) throw errors.notFound();
  const ids = await subtreeIds(env.DB, ownerId, id);
  for (const part of chunk(ids, 50)) {
    const ph = part.map((_, i) => `?${i + 1}`).join(",");
    const files = await env.DB.prepare(`SELECT r2_key FROM nodes WHERE id IN (${ph}) AND r2_key IS NOT NULL`)
      .bind(...part).all<{ r2_key: string }>();
    await Promise.all(files.results.map((f) => env.BUCKET.delete(f.r2_key)));
    await env.DB.prepare(`DELETE FROM shares WHERE node_id IN (${ph})`).bind(...part).run();
    await env.DB.prepare(`DELETE FROM nodes WHERE id IN (${ph})`).bind(...part).run();
  }
}

export async function purgeExpiredTrash(env: Env): Promise<void> {
  const cutoff = Date.now() - Number(env.TRASH_RETENTION_DAYS) * 86400000;
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
  const statements = [
    ...chunk(ids, 99).map((part) => {
      const ph = part.map((_, i) => `?${i + 2}`).join(",");
      return db.prepare(`UPDATE nodes SET deleted_at = NULL WHERE owner_id = ?1 AND id IN (${ph})`)
        .bind(ownerId, ...part);
    }),
    db.prepare("UPDATE nodes SET parent_id = ?1, name = ?2 WHERE id = ?3")
      .bind(targetParent, name, node.id),
  ];
  try {
    await db.batch(statements);
  } catch (e) {
    // uniqueName 与 batch 之间并发同名恢复撞 UNIQUE：映射 409（与 createDir 惯例一致）
    if (!(e instanceof Error && e.message.includes("UNIQUE constraint failed"))) throw e;
    throw errors.conflict();
  }
}

// 批量请求体校验：非空字符串数组、≤500（与列表上限一致）
function parseIds(body: { ids?: unknown }): string[] {
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
  let purged = 0;
  const failed: { id: string; reason: string }[] = [];
  for (const id of ids) {
    try {
      await permanentDeleteNode(c.env, user.id, id);
      purged++;
    } catch (e) {
      // 同批父目录先删导致子节点已消失（404）：视为已清除；其余失败记录不阻断
      if (e instanceof HttpError && e.status === 404) {
        purged++;
        continue;
      }
      failed.push({ id, reason: e instanceof Error ? e.message : "未知错误" });
    }
  }
  return c.json({ ok: true, purged, failed });
});

trash.post("/:id/restore", async (c) => {
  await restoreTrashNode(c.env.DB, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});

trash.delete("/:id", async (c) => {
  await permanentDeleteNode(c.env, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
