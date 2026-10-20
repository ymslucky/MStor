import { Hono } from "hono";
import type { AppEnv } from "../env";
import { permanentDeleteMany, permanentDeleteNode, parseIds, restoreTrashNode } from "../data/trash";

// 回收站路由层：只做解析/序列化，业务函数在 data/trash（原先从这里导出，被 files/shares 反向 import）
export const trash = new Hono<AppEnv>();

trash.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM nodes WHERE owner_id = ?1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500"
  ).bind(c.get("user").id).all();
  return c.json({ nodes: results });
});

trash.post("/batch-restore", async (c) => {
  const ids = parseIds(await c.req.json());
  const user = c.get("user");
  let restored = 0;
  const failed: { id: string; reason: string }[] = [];
  for (const id of ids) {
    try {
      await restoreTrashNode(c.env.DB, user.id, id);
      restored++;
    } catch (e) {
      // 单项失败不阻断其余项（如并发同名 409、id 不存在 404）
      failed.push({ id, reason: e instanceof Error ? e.message : "未知错误" });
    }
  }
  return c.json({ ok: true, restored, failed });
});

trash.post("/batch-purge", async (c) => {
  const ids = parseIds(await c.req.json());
  const user = c.get("user");
  const purged = await permanentDeleteMany(c.env, user.id, ids);
  return c.json({ ok: true, purged, failed: [] });
});

trash.post("/:id/restore", async (c) => {
  await restoreTrashNode(c.env.DB, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});

trash.delete("/:id", async (c) => {
  await permanentDeleteNode(c.env, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
