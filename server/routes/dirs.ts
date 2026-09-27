import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { createDir } from "../lib/nodes";

export const dirs = new Hono<AppEnv>();

dirs.post("/", async (c) => {
  const { parentId = "", name } = await c.req.json<{ parentId?: string; name: string }>();
  if (!name?.trim()) throw errors.badRequest("名称不能为空");
  const node = await createDir(c.env.DB, c.get("user").id, parentId, name.trim());
  return c.json(node, 201);
});
