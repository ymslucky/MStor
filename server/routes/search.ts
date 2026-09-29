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
      `SELECT n.* FROM nodes_fts f JOIN nodes n ON n.rowid = f.rowid
       WHERE nodes_fts MATCH ?1 AND n.owner_id = ?2 AND n.deleted_at IS NULL
       ORDER BY n.updated_at DESC LIMIT 50`
    ).bind(`"${safe}"`, c.get("user").id).all()).results;
  } else {
    results = (await c.env.DB.prepare(
      `SELECT * FROM nodes WHERE owner_id = ?1 AND deleted_at IS NULL AND name LIKE ?2
       ORDER BY updated_at DESC LIMIT 50`
    ).bind(c.get("user").id, `%${safe}%`).all()).results;
  }
  // 面包屑：物化路径给出祖先 id 链，一次反查全部祖先名后 JS 拼装（替代递归 CTE）。
  // 路径含自身名、不含根哨兵（name=''）
  const paths: Record<string, string> = {};
  const ancestorIds = new Set<string>();
  for (const r of results) {
    for (const id of (r.path as string).split("/")) if (id) ancestorIds.add(id);
  }
  const nameById = new Map<string, string>();
  for (const part of chunk([...ancestorIds], 90)) {
    const ph = part.map(() => "?").join(",");
    // 纯 PK 查找（避免 owner 索引全扫），JS 侧过滤 owner
    const { results: rows } = await c.env.DB.prepare(
      `SELECT id, owner_id, name FROM nodes WHERE id IN (${ph})`
    ).bind(...part).all<{ id: string; owner_id: string; name: string }>();
    for (const row of rows) if (row.owner_id === c.get("user").id) nameById.set(row.id, row.name);
  }
  for (const r of results) {
    // 路径含自身名、不含根哨兵：祖先名（root→parent）+ 自身
    const segs = (r.path as string).split("/").filter(Boolean).map((id) => nameById.get(id) ?? "").filter((n) => n !== "");
    paths[r.id as string] = [...segs, r.name as string].join("/");
  }
  return c.json({ nodes: results, paths });
});
