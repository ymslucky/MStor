import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { createDir, getNode, validateNodeName } from "../lib/nodes";

export const dirs = new Hono<AppEnv>();

dirs.post("/", async (c) => {
  const user = c.get("user");
  const { parentId = "", name } = await c.req.json<{ parentId?: string; name: string }>();
  const validName = validateNodeName(name);
  if (parentId !== "") {
    const parent = await getNode(c.env.DB, user.id, parentId);
    if (!parent || !parent.is_dir) throw errors.notFound();
  }
  const node = await createDir(c.env.DB, user.id, parentId, validName);
  return c.json(node, 201);
});
