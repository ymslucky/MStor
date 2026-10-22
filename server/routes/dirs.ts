import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { createDir, resolveParent, uniqueName, validateNodeName } from "../lib/nodes";
import type { NodeRow } from "../types";

export const dirs = new Hono<AppEnv>();

/** 目录树一次性返回（移动/复制目标选择用）：避免前端逐目录 N+1 请求。
 *  上限 5000 条并带 truncated 标记，防止异常大目录把响应撑爆。 */
dirs.get("/tree", async (c) => {
  const LIMIT = 5000;
  const { results } = await c.env.DB.prepare(
    "SELECT id, parent_id, name, path FROM nodes WHERE workspace_id = ?1 AND is_dir = 1 AND deleted_at IS NULL AND name <> '' ORDER BY path, name LIMIT ?2",
  )
    .bind(c.get("workspace").id, LIMIT + 1)
    .all<{ id: string; parent_id: string; name: string; path: string }>();
  const truncated = results.length > LIMIT;
  return c.json({ dirs: truncated ? results.slice(0, LIMIT) : results, truncated });
});

dirs.post("/", async (c) => {
  const { parentId = "", name } = await c.req.json<{ parentId?: string; name: string }>();
  const validName = validateNodeName(name);
  // '' 表示根 → 根哨兵行（顶层节点 parent_id = 哨兵行 id）
  const found = await resolveParent(c.env.DB, c.get("workspace").id, parentId);
  if (!found || !found.is_dir) throw errors.notFound();
  const node = await createDir(c.env.DB, c.get("workspace").id, found.id, validName, found);
  return c.json(node, 201);
});

// 幂等建目录（嵌套文件夹上传逐级建目录用）：已有同名活跃目录直接复用，
// 回收站同名不占名（childByName 只匹配活跃行），重名活跃行由 uniqueName 让位为 "name (2)"
dirs.post("/ensure", async (c) => {
  const { parentId = "", name } = await c.req.json<{ parentId?: string; name: string }>();
  const validName = validateNodeName(name);
  const found = await resolveParent(c.env.DB, c.get("workspace").id, parentId);
  if (!found || !found.is_dir) throw errors.notFound();
  const active = await c.env.DB.prepare(
    "SELECT * FROM nodes WHERE workspace_id = ?1 AND parent_id = ?2 AND name = ?3 AND is_dir = 1 AND deleted_at IS NULL",
  ).bind(c.get("workspace").id, found.id, validName).first<NodeRow>();
  if (active) return c.json(active);
  const node = await createDir(c.env.DB, c.get("workspace").id, found.id, await uniqueName(c.env.DB, c.get("workspace").id, found.id, validName), found);
  return c.json(node, 201);
});
