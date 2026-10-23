import { Hono } from "hono";
import type { AppEnv } from "../env";
import { NODES_PK_INDEX, jsonList, jsonSet } from "../lib/sql";

/** 文件名检索 2.0（方案 P2 B8）：只索引文件名，服务端过滤/排序/分页，不做正文检索 */
export const search = new Hono<AppEnv>();

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

type Sort = "recent" | "name" | "size";

function parseSort(raw: string | undefined): Sort {
  return raw === "name" || raw === "size" ? raw : "recent";
}

/** 可选数字参数：缺失/非法一律视为「不过滤」 */
function num(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

search.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const safe = q.replace(/["'()*%_\\]/g, " ").trim();
  if (!safe) return c.json({ nodes: [], paths: {}, nextCursor: null });

  const workspaceId = c.get("workspace").id;
  const rawLimit = num(c.req.query("limit"));
  const limit = rawLimit === null ? DEFAULT_LIMIT : Math.min(Math.max(1, Math.trunc(rawLimit)), MAX_LIMIT);
  const sort = parseSort(c.req.query("sort"));

  const where: string[] = ["n.workspace_id = ?", "n.deleted_at IS NULL"];
  const whereBinds: unknown[] = [workspaceId];
  const type = c.req.query("type");
  if (type === "file" || type === "dir") {
    where.push("n.is_dir = ?");
    whereBinds.push(type === "dir" ? 1 : 0);
  }
  const from = num(c.req.query("from"));
  const to = num(c.req.query("to"));
  const min = num(c.req.query("min"));
  const max = num(c.req.query("max"));
  if (from !== null) { where.push("n.updated_at >= ?"); whereBinds.push(Math.trunc(from)); }
  if (to !== null) { where.push("n.updated_at <= ?"); whereBinds.push(Math.trunc(to)); }
  if (min !== null) { where.push("COALESCE(n.size, 0) >= ?"); whereBinds.push(Math.trunc(min)); }
  if (max !== null) { where.push("COALESCE(n.size, 0) <= ?"); whereBinds.push(Math.trunc(max)); }

  // recent 用 keyset 游标（热点路径），name/size 用偏移游标
  const order =
    sort === "name" ? "n.name ASC, n.id ASC" : sort === "size" ? "COALESCE(n.size, 0) DESC, n.id DESC" : "n.updated_at DESC, n.id DESC";
  const cursor = c.req.query("cursor") ?? "";
  let offset = 0;
  if (cursor.startsWith("u:") && sort === "recent") {
    const [, tsRaw, idRaw] = cursor.split(":");
    const ts = Number(tsRaw);
    if (Number.isFinite(ts) && idRaw) {
      where.push("(n.updated_at < ? OR (n.updated_at = ? AND n.id < ?))");
      whereBinds.push(ts, ts, idRaw);
    }
  } else if (cursor.startsWith("o:")) {
    const parsed = Number(cursor.slice(2));
    offset = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }

  const useFts = [...safe].length >= 3;
  const fromClause = useFts
    ? `FROM nodes_fts JOIN nodes n ON n.rowid = nodes_fts.rowid WHERE nodes_fts MATCH ? AND ${where.join(" AND ")}`
    : `FROM nodes n WHERE ${where.join(" AND ")} AND n.name LIKE ?`;
  // 多取一行判断是否还有下一页
  const sql = `SELECT n.* ${fromClause} ORDER BY ${order} LIMIT ? OFFSET ?`;
  const binds = useFts
    ? [`"${safe}"`, ...whereBinds, limit + 1, offset]
    : [...whereBinds, `%${safe}%`, limit + 1, offset];

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  const hasMore = results.length > limit;
  const page = hasMore ? results.slice(0, limit) : results;

  // 面包屑：物化路径给出祖先 id 链，一次反查全部祖先名后 JS 拼装
  const ancestorIds = new Set<string>();
  for (const r of page) {
    for (const id of String(r.path).split("/")) if (id) ancestorIds.add(id);
  }
  const nameById = new Map<string, string>();
  if (ancestorIds.size) {
    const { results: rows } = await c.env.DB.prepare(
      `SELECT id, name FROM nodes INDEXED BY ${NODES_PK_INDEX} WHERE workspace_id = ?1 AND id IN ${jsonSet()}`,
    ).bind(workspaceId, jsonList([...ancestorIds])).all<{ id: string; name: string }>();
    for (const row of rows) nameById.set(row.id, row.name);
  }
  const paths: Record<string, string> = {};
  for (const r of page) {
    const segs = String(r.path)
      .split("/")
      .filter(Boolean)
      .map((id) => nameById.get(id) ?? "")
      .filter((n) => n !== "");
    paths[String(r.id)] = [...segs, String(r.name)].join("/");
  }

  const last = page[page.length - 1];
  const nextCursor =
    !hasMore || !last ? null : sort === "recent" ? `u:${last.updated_at}:${last.id}` : `o:${offset + page.length}`;

  return c.json({ nodes: page, paths, nextCursor });
});
