import { Hono } from "hono";
import type { AppEnv } from "../env";
import { createInvitation, listInvitations, listMembers, revokeInvitation } from "../data/invitations";
import { listMemberships, removeMember, updateMemberRole } from "../data/workspaces";
import { errors } from "../lib/errors";

// 租户与成员管理：只有 owner/admin 能发邀请；member 只能读自己的空间列表
export const workspaces = new Hono<AppEnv>();

function requireManager(role: string) {
  if (role !== "owner" && role !== "admin") throw errors.forbidden("需要空间管理员权限");
}

workspaces.get("/", async (c) => {
  const list = await listMemberships(c.env.DB, c.get("user").id);
  return c.json({
    current: { id: c.get("workspace").id, name: c.get("workspace").name, role: c.get("role") },
    workspaces: list.map(({ workspace, role }) => ({ id: workspace.id, name: workspace.name, role })),
  });
});

workspaces.get("/members", async (c) => {
  const members = await listMembers(c.env.DB, c.get("workspace").id);
  return c.json({ members });
});

workspaces.get("/invitations", async (c) => {
  requireManager(c.get("role"));
  return c.json({ invitations: await listInvitations(c.env.DB, c.get("workspace").id) });
});

workspaces.post("/invitations", async (c) => {
  requireManager(c.get("role"));
  const { email, role = "member" } = await c.req.json<{ email?: unknown; role?: unknown }>();
  if (typeof email !== "string" || !email.trim()) throw errors.badRequest("email 必填");
  if (role !== "member" && role !== "admin") throw errors.badRequest("role 只能是 member 或 admin");
  const created = await createInvitation(c.env.DB, c.get("workspace").id, email, role, c.get("user").id);
  // 邀请链接：Access 落地页，登录后由中间件按 email 认领
  return c.json({ token: created.token, expiresAt: created.expiresAt, url: c.env.PUBLIC_URL + "/?invite=" + created.token }, 201);
});

workspaces.delete("/invitations/:token", async (c) => {
  requireManager(c.get("role"));
  await revokeInvitation(c.env.DB, c.get("workspace").id, c.req.param("token"), c.get("user").id);
  return c.json({ ok: true });
});

workspaces.patch("/members/:userId", async (c) => {
  requireManager(c.get("role"));
  const userId = c.req.param("userId");
  if (userId === c.get("user").id) throw errors.badRequest("不能修改自己的角色");
  const body = (await c.req.json().catch(() => ({}))) as { role?: string };
  const role = body?.role;
  if (role !== "owner" && role !== "admin" && role !== "member") throw errors.badRequest("role 非法");
  const result = await updateMemberRole(c.env.DB, c.get("workspace").id, userId, role);
  if (result === "not_found") throw errors.notFound();
  if (result === "last_owner") throw errors.badRequest("空间至少保留一名所有者");
  return c.json({ ok: true });
});

workspaces.delete("/members/:userId", async (c) => {
  requireManager(c.get("role"));
  const userId = c.req.param("userId");
  if (userId === c.get("user").id) throw errors.badRequest("不能移除自己");
  const result = await removeMember(c.env.DB, c.get("workspace").id, userId);
  if (result === "not_found") throw errors.notFound();
  if (result === "last_owner") throw errors.badRequest("空间至少保留一名所有者");
  return c.json({ ok: true });
});
