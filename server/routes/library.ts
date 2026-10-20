import { Hono } from "hono";
import type { AppEnv } from "../env";
import { addFavorite, listFavorites, listRecent, recordView, removeFavorite } from "../data/library";
import { attachTag, createTag, deleteTag, detachTag, listTagNodes, listTags } from "../data/tags";

// 收藏与最近访问：都是「当前空间 + 当前用户」维度，节点必须属于该空间
export const library = new Hono<AppEnv>();

library.get("/favorites", async (c) => {
  const nodes = await listFavorites(c.env.DB, c.get("workspace").id, c.get("user").id);
  return c.json({ nodes });
});

library.put("/favorites/:id", async (c) => {
  await addFavorite(c.env.DB, c.get("workspace").id, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});

library.delete("/favorites/:id", async (c) => {
  await removeFavorite(c.env.DB, c.get("workspace").id, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});

library.get("/recent", async (c) => {
  const nodes = await listRecent(c.env.DB, c.get("workspace").id, c.get("user").id);
  return c.json({ nodes });
});

library.post("/views/:id", async (c) => {
  await recordView(c.env.DB, c.get("workspace").id, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});

// —— 标签（空间内共享）——
library.get("/tags", async (c) => c.json({ tags: await listTags(c.env.DB, c.get("workspace").id) }));

library.post("/tags", async (c) => {
  const { name, color } = await c.req.json<{ name?: unknown; color?: unknown }>();
  const tag = await createTag(c.env.DB, c.get("workspace").id, name, color);
  return c.json(tag, 201);
});

library.delete("/tags/:tagId", async (c) => {
  await deleteTag(c.env.DB, c.get("workspace").id, c.req.param("tagId"));
  return c.json({ ok: true });
});

library.get("/tags/:tagId/nodes", async (c) => {
  const nodes = await listTagNodes(c.env.DB, c.get("workspace").id, c.req.param("tagId"));
  return c.json({ nodes });
});

library.put("/tags/:tagId/nodes/:nodeId", async (c) => {
  await attachTag(c.env.DB, c.get("workspace").id, c.req.param("tagId"), c.req.param("nodeId"));
  return c.json({ ok: true });
});

library.delete("/tags/:tagId/nodes/:nodeId", async (c) => {
  await detachTag(c.env.DB, c.get("workspace").id, c.req.param("tagId"), c.req.param("nodeId"));
  return c.json({ ok: true });
});