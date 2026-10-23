import { Hono } from "hono";
import type { AppEnv } from "../env";
import { permanentDeleteMany, permanentDeleteNode, parseIds, restoreTrashNode } from "../data/trash";
import { recomputeStorageStats } from "../data/storage";
import { recordAudit } from "../lib/audit";

// 回收站路由层：只做解析/序列化，业务函数在 data/trash（原先从这里导出，被 files/shares 反向 import）
export const trash = new Hono<AppEnv>();

trash.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM nodes WHERE workspace_id = ?1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500"
  ).bind(c.get("workspace").id).all();
  return c.json({ nodes: results });
});

trash.post("/batch-restore", async (c) => {
  const ids = parseIds(await c.req.json());
  let restored = 0;
  const failed: { id: string; reason: string }[] = [];
  for (const id of ids) {
    try {
      await restoreTrashNode(c.env.DB, c.get("workspace").id, id);
      restored++;
    } catch (e) {
      // 单项失败不阻断其余项（如并发同名 409、id 不存在 404）
      failed.push({ id, reason: e instanceof Error ? e.message : "未知错误" });
    }
  }
  await recomputeStorageStats(c.env.DB, c.get("workspace").id);
  if (restored > 0) {
    await recordAudit(c.env.DB, {
      workspaceId: c.get("workspace").id,
      actorId: c.get("selfId"),
      action: "node.batch_restore",
      resourceType: "node",
      meta: { requested: ids.length, restored, failed: failed.length },
      category: "file",
      severity: "info",
      requestId: c.req.header("cf-ray") ?? null,
    });
  }
  return c.json({ ok: true, restored, failed });
});

trash.post("/batch-purge", async (c) => {
  const ids = parseIds(await c.req.json());
  const purged = await permanentDeleteMany(c.env, c.get("workspace").id, ids);
  await recomputeStorageStats(c.env.DB, c.get("workspace").id);
  await recordAudit(c.env.DB, {
    workspaceId: c.get("workspace").id,
    actorId: c.get("selfId"),
    action: "node.batch_purge",
    resourceType: "node",
    meta: { requested: ids.length, purged },
    category: "file",
    severity: "critical",
    requestId: c.req.header("cf-ray") ?? null,
  });
  return c.json({ ok: true, purged, failed: [] });
});

trash.post("/:id/restore", async (c) => {
  await restoreTrashNode(c.env.DB, c.get("workspace").id, c.req.param("id"));
  await recomputeStorageStats(c.env.DB, c.get("workspace").id);
  await recordAudit(c.env.DB, {
    workspaceId: c.get("workspace").id,
    actorId: c.get("selfId"),
    action: "node.restore",
    targetId: c.req.param("id"),
    resourceType: "node",
    resourceId: c.req.param("id"),
    category: "file",
    severity: "info",
    requestId: c.req.header("cf-ray") ?? null,
  });
  return c.json({ ok: true });
});

trash.delete("/:id", async (c) => {
  await permanentDeleteNode(c.env, c.get("workspace").id, c.req.param("id"));
  await recomputeStorageStats(c.env.DB, c.get("workspace").id);
  await recordAudit(c.env.DB, {
    workspaceId: c.get("workspace").id,
    actorId: c.get("selfId"),
    action: "node.purge",
    targetId: c.req.param("id"),
    resourceType: "node",
    resourceId: c.req.param("id"),
    category: "file",
    severity: "critical",
    requestId: c.req.header("cf-ray") ?? null,
  });
  return c.json({ ok: true });
});
