import { Hono } from "hono";
import type { AppEnv } from "../env";
import { listNotifications, markAllRead, markNotificationRead } from "../data/notifications";

// 站内通知：只读自己那一份，不做邮件投递（方案 §0.1 假设 A2）
export const notifications = new Hono<AppEnv>();

notifications.get("/", async (c) => c.json(await listNotifications(c.env.DB, c.get("user").id)));

notifications.post("/:id/read", async (c) => {
  await markNotificationRead(c.env.DB, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});

notifications.post("/read-all", async (c) => c.json({ ok: true, marked: await markAllRead(c.env.DB, c.get("user").id) }));
