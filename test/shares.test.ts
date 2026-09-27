import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { randomId } from "../server/lib/crypto";
import { seedNode, seedUser, sessionHeaders } from "./helpers";

const json = { "content-type": "application/json" };

async function upload(u: Awaited<ReturnType<typeof seedUser>>, name: string, body: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT", headers: await sessionHeaders(u), body,
  });
  return ((await res.json()) as { id: string }).id;
}

test("create share → public meta → raw download increments counter", async () => {
  const u = await seedUser();
  const fid = await upload(u, "share.txt", "shared-data");
  const created = await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: fid }),
  });
  expect(created.status).toBe(201);
  const { token } = (await created.json()) as { token: string };

  const meta = await SELF.fetch(`https://example.com/api/s/${token}`);
  expect(meta.status).toBe(200);
  expect(((await meta.json()) as { name: string }).name).toBe("share.txt");

  const raw = await SELF.fetch(`https://example.com/api/s/${token}/raw/${fid}`);
  expect(raw.status).toBe(200);
  expect(await raw.text()).toBe("shared-data");
  const row = await env.DB.prepare("SELECT downloads FROM shares WHERE token = ?1").bind(token).first<{ downloads: number }>();
  expect(row!.downloads).toBe(1);
});

test("password-protected share requires x-share-password", async () => {
  const u = await seedUser();
  const fid = await upload(u, "p.txt", "x");
  const { token } = (await (await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: fid, password: "1234" }),
  })).json()) as { token: string };
  expect((await SELF.fetch(`https://example.com/api/s/${token}`)).status).toBe(401);
  const ok = await SELF.fetch(`https://example.com/api/s/${token}`, { headers: { "x-share-password": "1234" } });
  expect(ok.status).toBe(200);
});

test("expired share returns 410; revoked returns 404", async () => {
  const u = await seedUser();
  const fid = await upload(u, "e.txt", "x");
  const { token } = (await (await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: fid }),
  })).json()) as { token: string };
  const shareId = ((await env.DB.prepare("SELECT id FROM shares WHERE token = ?1").bind(token).first()) as { id: string }).id;
  await env.DB.prepare("UPDATE shares SET expires_at = ?1 WHERE id = ?2").bind(Date.now() - 1000, shareId).run();
  expect((await SELF.fetch(`https://example.com/api/s/${token}`)).status).toBe(410);
  await env.DB.prepare("UPDATE shares SET expires_at = NULL, revoked_at = ?1 WHERE id = ?2").bind(Date.now(), shareId).run();
  expect((await SELF.fetch(`https://example.com/api/s/${token}`)).status).toBe(404);
});

test("raw outside subtree is 404", async () => {
  const u = await seedUser();
  const fid = await upload(u, "in.txt", "x");
  const outsider = await seedNode({ owner_id: u.id, name: "out.txt", size: 1, r2_key: `${u.id}/${randomId()}` });
  const { token } = (await (await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: fid }),
  })).json()) as { token: string };
  expect((await SELF.fetch(`https://example.com/api/s/${token}/raw/${outsider.id}`)).status).toBe(404);
});

test("soft-deleted descendant is not downloadable; R2 miss does not bump counter", async () => {
  const u = await seedUser();
  const dir = (await (await SELF.fetch("https://example.com/api/dirs", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parentId: "", name: "d" }),
  })).json()) as { id: string };
  const fid = await upload(u, "gone.txt", "x");
  await SELF.fetch(`https://example.com/api/files/${fid}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parentId: dir.id }),
  });
  const { token } = (await (await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: dir.id }),
  })).json()) as { token: string };
  await SELF.fetch(`https://example.com/api/files/${fid}`, { method: "DELETE", headers: await sessionHeaders(u) });
  expect((await SELF.fetch(`https://example.com/api/s/${token}/raw/${fid}`)).status).toBe(404);

  // R2 对象缺失的文件：下载 404 且计数不增加
  const ghost = await seedNode({ owner_id: u.id, name: "ghost.txt", size: 1, r2_key: `${u.id}/${randomId()}` });
  const t2 = (await (await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: ghost.id }),
  })).json()) as { token: string };
  expect((await SELF.fetch(`https://example.com/api/s/${t2.token}/raw/${ghost.id}`)).status).toBe(404);
  const row = await env.DB.prepare("SELECT downloads FROM shares WHERE token = ?1").bind(t2.token).first<{ downloads: number }>();
  expect(row!.downloads).toBe(0);
});

test("invalid expiresInDays is rejected", async () => {
  const u = await seedUser();
  const fid = await upload(u, "v.txt", "x");
  for (const days of [-1, 0, "3"]) {
    const res = await SELF.fetch("https://example.com/api/shares", {
      method: "POST",
      headers: { ...(await sessionHeaders(u)), ...json },
      body: JSON.stringify({ nodeId: fid, expiresInDays: days }),
    });
    expect(res.status).toBe(400);
  }
});
