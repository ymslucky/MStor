import { Hono } from "hono";
import type { AppEnv } from "../env";

export const search = new Hono<AppEnv>();

search.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  // 去除 FTS5/LIKE 语法字符，按纯文本子串处理
  const safe = q.replace(/["'()*%_\\]/g, " ").trim();
  if (!safe) return c.json({ nodes: [] });
  // trigram 分词要求查询 ≥3 码点且为整段子串；短查询退化为 LIKE
  if ([...safe].length >= 3) {
    const { results } = await c.env.DB.prepare(
      `SELECT n.* FROM nodes_fts f JOIN nodes n ON n.id = f.node_id
       WHERE nodes_fts MATCH ?1 AND n.owner_id = ?2 AND n.deleted_at IS NULL
       ORDER BY n.updated_at DESC LIMIT 50`
    ).bind(`"${safe}"`, c.get("user").id).all();
    return c.json({ nodes: results });
  }
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM nodes WHERE owner_id = ?1 AND deleted_at IS NULL AND name LIKE ?2
     ORDER BY updated_at DESC LIMIT 50`
  ).bind(c.get("user").id, `%${safe}%`).all();
  return c.json({ nodes: results });
});
