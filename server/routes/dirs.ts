import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { createDir, resolveParent, uniqueName, validateNodeName } from "../lib/nodes";
import type { NodeRow } from "../types";

export const dirs = new Hono<AppEnv>();

dirs.post("/", async (c) => {
  const user = c.get("user");
  const { parentId = "", name } = await c.req.json<{ parentId?: string; name: string }>();
  const validName = validateNodeName(name);
  // '' 表示根 → 根哨兵行（顶层节点 parent_id = 哨兵行 id）
  const found = await resolveParent(c.env.DB, user.id, parentId);
  if (!found || !found.is_dir) throw errors.notFound();
  const node = await createDir(c.env.DB, user.id, found.id, validName, found);
  return c.json(node, 201);
});

// 幂等建目录（嵌套文件夹上传逐级建目录用）：已有同名活跃目录直接复用，
// 回收站同名不占名（childByName 只匹配活跃行），重名活跃行由 uniqueName 让位为 "name (2)"
dirs.post("/ensure", async (c) => {
  const user = c.get("user");
  const { parentId = "", name } = await c.req.json<{ parentId?: string; name: string }>();
  const validName = validateNodeName(name);
  const found = await resolveParent(c.env.DB, user.id, parentId);
  if (!found || !found.is_dir) throw errors.notFound();
  const active = await c.env.DB.prepare(
    "SELECT * FROM nodes WHERE owner_id = ?1 AND parent_id = ?2 AND name = ?3 AND is_dir = 1 AND deleted_at IS NULL",
  ).bind(user.id, found.id, validName).first<NodeRow>();
  if (active) return c.json(active);
  const node = await createDir(c.env.DB, user.id, found.id, await uniqueName(c.env.DB, user.id, found.id, validName), found);
  return c.json(node, 201);
});
