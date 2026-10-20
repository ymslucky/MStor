import { Hono } from "hono";
import type { AppEnv } from "../env";
import { addFavorite, listFavorites, listRecent, recordView, removeFavorite } from "../data/library";

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
