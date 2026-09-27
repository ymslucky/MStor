import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { errors } from "../lib/errors";
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
  for (const part of chunk(ids, 90)) {
    const ph = part.map((_, i) => `?${i + 3}`).join(",");
    await db.prepare(`UPDATE nodes SET deleted_at = ?1 WHERE owner_id = ?2 AND deleted_at IS NULL AND id IN (${ph})`)
      .bind(now, ownerId, ...part).run();
  }
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
    // 子树随父目录一起删除后，子行再被轮到时 404，忽略即可
    await permanentDeleteNode(env, r.owner_id, r.id).catch(() => {});
  }
}

export const trash = new Hono<AppEnv>();

trash.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM nodes WHERE owner_id = ?1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500"
  ).bind(c.get("user").id).all();
  return c.json({ nodes: results });
});

trash.post("/:id/restore", async (c) => {
  const user = c.get("user");
  const node = await getNode(c.env.DB, user.id, c.req.param("id"));
  if (!node || !node.deleted_at) throw errors.notFound();
  const parent = node.parent_id === "" ? null : await getNode(c.env.DB, user.id, node.parent_id);
  const targetParent = parent && !parent.deleted_at ? node.parent_id : "";
  // 排除自身：节点仍在表内（软删除态），否则 childByName 命中自己导致恢复后变成 "f (2).txt"
  const name = await uniqueName(c.env.DB, user.id, targetParent, node.name, node.id);
  const ids = await subtreeIds(c.env.DB, user.id, node.id);
  const statements = [
    ...chunk(ids, 99).map((part) => {
      const ph = part.map((_, i) => `?${i + 2}`).join(",");
      return c.env.DB.prepare(`UPDATE nodes SET deleted_at = NULL WHERE owner_id = ?1 AND id IN (${ph})`)
        .bind(user.id, ...part);
    }),
    c.env.DB.prepare("UPDATE nodes SET parent_id = ?1, name = ?2 WHERE id = ?3")
      .bind(targetParent, name, node.id),
  ];
  await c.env.DB.batch(statements);
  return c.json({ ok: true });
});

trash.delete("/:id", async (c) => {
  await permanentDeleteNode(c.env, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
