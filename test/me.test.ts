import { env, SELF } from "cloudflare:test";
import { sign } from "hono/jwt";
import { expect, test } from "vitest";
import { pbkdf2Verify } from "../server/lib/crypto";
import { ensureRootDir } from "../server/lib/nodes";
import { SESSION_COOKIE } from "../server/middleware/session";
import { seedNode, seedUser, sessionHeaders } from "./helpers";

test("GET /api/me returns profile with usage", async () => {
  const u = await seedUser();
  await ensureRootDir(env.DB, u.id);
  const res = await SELF.fetch("https://example.com/api/me", { headers: await sessionHeaders(u) });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { name: string; quotaBytes: number; usedBytes: number };
  expect(body.name).toBe("tester");
  expect(body.quotaBytes).toBe(u.quota_bytes);
  expect(typeof body.usedBytes).toBe("number");
});

test("GET /api/me without session is 401", async () => {
  const res = await SELF.fetch("https://example.com/api/me");
  expect(res.status).toBe(401);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
});

test("invalid token is 401", async () => {
  const u = await seedUser();
  const token = await sign({ sub: u.id, role: u.role, exp: Math.floor(Date.now() / 1000) + 3600 }, "wrong-secret");
  const res = await SELF.fetch("https://example.com/api/me", { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
  expect(res.status).toBe(401);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
});

test("PUT /api/me/webdav-password stores pbkdf2 hash", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/me/webdav-password", {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ password: "davpass123" }),
  });
  expect(res.status).toBe(200);
  const row = await env.DB.prepare("SELECT webdav_password_hash FROM users WHERE id = ?1").bind(u.id).first<{ webdav_password_hash: string }>();
  const hash = row!.webdav_password_hash!;
  expect(hash.startsWith("pbkdf2$")).toBe(true);
  expect(await pbkdf2Verify("davpass123", hash)).toBe(true);
});

test("PUT /api/me/webdav-password rejects short password", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/me/webdav-password", {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ password: "short" }),
  });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("BAD_REQUEST");
});

test("admin endpoints enforce role", async () => {
  const member = await seedUser();
  const admin = await seedUser({ role: "admin" });
  const forbidden = await SELF.fetch("https://example.com/api/me/admin/users", { headers: await sessionHeaders(member) });
  expect(forbidden.status).toBe(403);
  const patchForbidden = await SELF.fetch(`https://example.com/api/me/admin/users/${admin.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(member)), "content-type": "application/json" },
    body: JSON.stringify({ quota_bytes: 1 }),
  });
  expect(patchForbidden.status).toBe(403);
  const ok = await SELF.fetch("https://example.com/api/me/admin/users", { headers: await sessionHeaders(admin) });
  expect(ok.status).toBe(200);
  const { users } = (await ok.json()) as { users: { id: string }[] };
  expect(users.length).toBe(2);
  const patched = await SELF.fetch(`https://example.com/api/me/admin/users/${member.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ quota_bytes: 2048 }),
  });
  expect(patched.status).toBe(200);
  const row = await env.DB.prepare("SELECT quota_bytes FROM users WHERE id = ?1").bind(member.id).first<{ quota_bytes: number }>();
  expect(row!.quota_bytes).toBe(2048);
});

test("admin can disable and re-enable a user via PATCH", async () => {
  const admin = await seedUser({ role: "admin" });
  const member = await seedUser();
  const disable = await SELF.fetch(`https://example.com/api/me/admin/users/${member.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ disabled: true }),
  });
  expect(disable.status).toBe(200);
  const row = await env.DB.prepare("SELECT disabled_at FROM users WHERE id = ?1").bind(member.id).first<{ disabled_at: number | null }>();
  expect(row!.disabled_at).not.toBeNull();
  const enable = await SELF.fetch(`https://example.com/api/me/admin/users/${member.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ disabled: false }),
  });
  expect(enable.status).toBe(200);
  const reenabled = await env.DB.prepare("SELECT disabled_at FROM users WHERE id = ?1").bind(member.id).first<{ disabled_at: number | null }>();
  expect(reenabled!.disabled_at).toBeNull();
});

test("admin cannot disable self", async () => {
  const admin = await seedUser({ role: "admin" });
  const res = await SELF.fetch(`https://example.com/api/me/admin/users/${admin.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ disabled: true }),
  });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("BAD_REQUEST");
});

test("admin cannot demote self", async () => {
  const admin = await seedUser({ role: "admin" });
  const res = await SELF.fetch(`https://example.com/api/me/admin/users/${admin.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ role: "member" }),
  });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("BAD_REQUEST");
});

test("admin can still update own quota", async () => {
  const admin = await seedUser({ role: "admin" });
  const res = await SELF.fetch(`https://example.com/api/me/admin/users/${admin.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ quota_bytes: 4096 }),
  });
  expect(res.status).toBe(200);
  const row = await env.DB.prepare("SELECT quota_bytes FROM users WHERE id = ?1").bind(admin.id).first<{ quota_bytes: number }>();
  expect(row!.quota_bytes).toBe(4096);
});

test("disabled flag persists in admin list", async () => {
  const admin = await seedUser({ role: "admin" });
  const member = await seedUser();
  const patched = await SELF.fetch(`https://example.com/api/me/admin/users/${member.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ disabled: true }),
  });
  expect(patched.status).toBe(200);
  const res = await SELF.fetch("https://example.com/api/me/admin/users", { headers: await sessionHeaders(admin) });
  expect(res.status).toBe(200);
  const { users } = await res.json<{ users: { id: string; disabled_at: number | null }[] }>();
  expect(users.find((u) => u.id === member.id)!.disabled_at).not.toBeNull();
});

test("disabled user session is rejected", async () => {
  const u = await seedUser();
  await env.DB.prepare("UPDATE users SET disabled_at = ?1 WHERE id = ?2").bind(Date.now(), u.id).run();
  const res = await SELF.fetch("https://example.com/api/me", { headers: await sessionHeaders(u) });
  expect(res.status).toBe(403);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
});

test("admin can act as another user; member cannot", async () => {
  const admin = await seedUser({ role: "admin" });
  const member = await seedUser();
  // member 名下放一个文件，admin 名下不放
  await seedNode({ owner_id: member.id, name: "members-file.txt" });
  const asMember = await SELF.fetch("https://example.com/api/files", {
    headers: { ...(await sessionHeaders(admin)), "x-act-as": member.id },
  });
  expect(asMember.status).toBe(200);
  const listed = await asMember.json<{ nodes: { name: string }[] }>();
  expect(listed.nodes.map((n) => n.name)).toContain("members-file.txt");
  // member 携带 x-act-as 指向 admin：头被忽略，看到的仍是自己空间（空列表 + admin 文件不在）
  await seedNode({ owner_id: admin.id, name: "admins-file.txt" });
  const memberView = await SELF.fetch("https://example.com/api/files", {
    headers: { ...(await sessionHeaders(member)), "x-act-as": admin.id },
  });
  const memberListed = await memberView.json<{ nodes: { name: string }[] }>();
  expect(memberListed.nodes.map((n) => n.name)).not.toContain("admins-file.txt");
  // 目标不存在 → 404
  const missing = await SELF.fetch("https://example.com/api/files", {
    headers: { ...(await sessionHeaders(admin)), "x-act-as": "no-such-user" },
  });
  expect(missing.status).toBe(404);
});

test("admin can rename a user", async () => {
  const admin = await seedUser({ role: "admin" });
  const member = await seedUser();
  const res = await SELF.fetch(`https://example.com/api/me/admin/users/${member.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ name: "  张三  " }),
  });
  expect(res.status).toBe(200);
  const row = await env.DB.prepare("SELECT name FROM users WHERE id = ?1").bind(member.id).first<{ name: string }>();
  // 存储前 trim
  expect(row!.name).toBe("张三");
});

test("admin can rename self", async () => {
  const admin = await seedUser({ role: "admin" });
  const res = await SELF.fetch(`https://example.com/api/me/admin/users/${admin.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ name: "chief" }),
  });
  expect(res.status).toBe(200);
  const row = await env.DB.prepare("SELECT name FROM users WHERE id = ?1").bind(admin.id).first<{ name: string }>();
  expect(row!.name).toBe("chief");
});

test("rename rejects blank and oversized names", async () => {
  const admin = await seedUser({ role: "admin" });
  for (const name of ["", "   ", "x".repeat(65)]) {
    const res = await SELF.fetch(`https://example.com/api/me/admin/users/${admin.id}`, {
      method: "PATCH",
      headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("BAD_REQUEST");
  }
});

test("rename rejects non-string name", async () => {
  const admin = await seedUser({ role: "admin" });
  const res = await SELF.fetch(`https://example.com/api/me/admin/users/${admin.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ name: 42 }),
  });
  expect(res.status).toBe(400);
});

test("GET /api/me when acting as returns target user plus self", async () => {
  const admin = await seedUser({ role: "admin" });
  const member = await seedUser();
  const res = await SELF.fetch("https://example.com/api/me", {
    headers: { ...(await sessionHeaders(admin)), "x-act-as": member.id },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    id: string; name: string; role: string;
    self: { id: string; name: string; role: string };
  };
  // 空间信息 = 目标用户
  expect(body.id).toBe(member.id);
  expect(body.name).toBe(member.name);
  expect(body.role).toBe(member.role);
  // 登录账号 = 管理员自己
  expect(body.self).toEqual({ id: admin.id, name: admin.name, role: "admin" });
});

test("GET /api/me self mirrors user when not acting as", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/me", { headers: await sessionHeaders(u) });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { id: string; name: string; role: string; self: { id: string; name: string; role: string } };
  expect(body.self).toEqual({ id: body.id, name: body.name, role: body.role });
});
