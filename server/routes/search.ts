import { Hono } from "hono";
import type { AppEnv } from "../env";
import { chunk } from "./trash";

export const search = new Hono<AppEnv>();

search.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  // 去除 FTS5/LIKE 语法字符，按纯文本子串处理
  const safe = q.replace(/["'()*%_\\]/g, " ").trim();
  if (!safe) return c.json({ nodes: [], paths: {} });
  // trigram 分词要求查询 ≥3 码点且为整段子串；短查询退化为 LIKE
  let results;
  if ([...safe].length >= 3) {
    results = (await c.env.DB.prepare(
      `SELECT n.* FROM nodes_fts f JOIN nodes n ON n.id = f.node_id
       WHERE nodes_fts MATCH ?1 AND n.owner_id = ?2 AND n.deleted_at IS NULL
       ORDER BY n.updated_at DESC LIMIT 50`
    ).bind(`"${safe}"`, c.get("user").id).all()).results;
  } else {
    results = (await c.env.DB.prepare(
      `SELECT * FROM nodes WHERE owner_id = ?1 AND deleted_at IS NULL AND name LIKE ?2
       ORDER BY updated_at DESC LIMIT 50`
    ).bind(c.get("user").id, `%${safe}%`).all()).results;
  }
  // 面包屑：自节点向上回溯到顶级，路径含自身名、不含根哨兵（name=''）
  const paths: Record<string, string> = {};
  for (const part of chunk(results.map((r) => r.id as string), 90)) {
    const ph = part.map((_, i) => `?${i + 1}`).join(",");
    const { results: rows } = await c.env.DB.prepare(`
      WITH RECURSIVE up AS (
        SELECT id, parent_id, name, id AS root_id, name AS path FROM nodes WHERE id IN (${ph})
        UNION ALL
        SELECT n.id, n.parent_id, n.name, u.root_id, n.name || '/' || u.path
        FROM nodes n JOIN up u ON u.parent_id = n.id WHERE n.name != ''
      ) SELECT root_id, path FROM up WHERE parent_id = '' AND name != ''
    `).bind(...part).all<{ root_id: string; path: string }>();
    for (const row of rows) paths[row.root_id] = row.path;
  }
  return c.json({ nodes: results, paths });
});
