import { env, SELF } from "cloudflare:test";
import { sign } from "hono/jwt";
import { expect, test } from "vitest";
import { pbkdf2Verify } from "../server/lib/crypto";
import { ensureRootDir } from "../server/lib/nodes";
import { SESSION_COOKIE } from "../server/middleware/session";
import { seedUser, sessionHeaders } from "./helpers";

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
