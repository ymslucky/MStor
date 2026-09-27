import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { breadcrumb, ensureRootDir, getNode, listChildren, moveNode } from "../lib/nodes";

export const files = new Hono<AppEnv>();

files.get("/", async (c) => {
  const user = c.get("user");
  const parentId = c.req.query("parentId") ?? "";
  const root = await ensureRootDir(c.env.DB, user.id);
  if (parentId !== "") {
    const parent = await getNode(c.env.DB, user.id, parentId);
    if (!parent || !parent.is_dir) throw errors.notFound();
  }
  const children = await listChildren(c.env.DB, user.id, parentId);
  // 根目录节点自身 parent_id 为 ''，parentId 为空时会混进列表，需排除
  const nodes = parentId === "" ? children.filter((n) => n.id !== root.id) : children;
  const crumbs = parentId === "" ? [] : await breadcrumb(c.env.DB, user.id, parentId);
  return c.json({ nodes, breadcrumb: crumbs, rootId: root.id });
});

files.patch("/:id", async (c) => {
  const user = c.get("user");
  const { name, parentId } = await c.req.json<{ name?: string; parentId?: string }>();
  const node = await getNode(c.env.DB, user.id, c.req.param("id"));
  if (!node) throw errors.notFound();
  await moveNode(c.env.DB, user.id, node.id, parentId ?? node.parent_id, name?.trim() || node.name);
  return c.json({ ok: true });
});
