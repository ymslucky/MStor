import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { ensureRootDir } from "../server/lib/nodes";
import { seedUser, sessionHeaders } from "./helpers";

test("GET /api/me returns profile with usage", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const res = await SELF.fetch("https://example.com/api/me", { headers: await sessionHeaders(u) });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { name: string; quotaBytes: number; usedBytes: number };
  expect(body.name).toBe("tester");
  expect(body.quotaBytes).toBe(u.quota_bytes);
  expect(typeof body.usedBytes).toBe("number");
  expect(root).toBeTruthy();
});

test("GET /api/me without session is 401", async () => {
  const res = await SELF.fetch("https://example.com/api/me");
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
  expect(row!.webdav_password_hash!.startsWith("pbkdf2$")).toBe(true);
});

test("admin endpoints enforce role", async () => {
  const member = await seedUser();
  const admin = await seedUser({ role: "admin" });
  const forbidden = await SELF.fetch("https://example.com/api/me/admin/users", { headers: await sessionHeaders(member) });
  expect(forbidden.status).toBe(403);
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
