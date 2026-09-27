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

test("public share children browses subtree", async () => {
  const user = await seedUser();
  const dir = await seedNode({ owner_id: user.id, name: "share-root", is_dir: 1 });
  const sub = await seedNode({ owner_id: user.id, parent_id: dir.id, name: "sub", is_dir: 1 });
  const file = await seedNode({ owner_id: user.id, parent_id: sub.id, name: "a.txt", size: 3 });
  const created = await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(user)), ...json },
    body: JSON.stringify({ nodeId: dir.id }),
  });
  const { token } = (await created.json()) as { token: string };
  const res = await SELF.fetch(`https://example.com/api/s/${token}/children/${sub.id}`);
  expect(res.status).toBe(200);
  const data = (await res.json()) as { name: string; children: { id: string; name: string }[] };
  expect(data.name).toBe("sub");
  expect(data.children.map((x) => x.id)).toContain(file.id);
  // 非子树目录 → 404
  const outsider = await seedNode({ owner_id: user.id, name: "outside", is_dir: 1 });
  const bad = await SELF.fetch(`https://example.com/api/s/${token}/children/${outsider.id}`);
  expect(bad.status).toBe(404);
  // 分享根自身可作为入口
  const rootSelf = await SELF.fetch(`https://example.com/api/s/${token}/children/${dir.id}`);
  expect(rootSelf.status).toBe(200);
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

async function createShare(u: Awaited<ReturnType<typeof seedUser>>, nodeId: string): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId }),
  });
  const { token } = (await res.json()) as { token: string };
  // POST 响应只有 token/url，share id 从 DB 反查
  const row = await env.DB.prepare("SELECT id FROM shares WHERE token = ?1").bind(token).first<{ id: string }>();
  return row!.id;
}

test("batch-revoke revokes own shares and public access dies", async () => {
  const u = await seedUser();
  const f1 = await upload(u, "b1.txt", "x");
  const f2 = await upload(u, "b2.txt", "x");
  const id1 = await createShare(u, f1);
  const id2 = await createShare(u, f2);
  const res = await SELF.fetch("https://example.com/api/shares/batch-revoke", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ ids: [id1, id2] }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; revoked: number; failed: { id: string }[] };
  expect(body.ok).toBe(true);
  expect(body.revoked).toBe(2);
  expect(body.failed).toEqual([]);
  const rows = await env.DB.prepare("SELECT id, revoked_at FROM shares WHERE id IN (?1, ?2)").bind(id1, id2).all<{ revoked_at: number | null }>();
  expect(rows.results.every((r) => r.revoked_at !== null)).toBe(true);
  // 撤销后列表为空
  const list = (await (await SELF.fetch("https://example.com/api/shares", { headers: await sessionHeaders(u) })).json()) as { shares: unknown[] };
  expect(list.shares).toEqual([]);
});

test("batch-revoke skips shares owned by others", async () => {
  const u1 = await seedUser();
  const u2 = await seedUser();
  const f1 = await upload(u1, "mine.txt", "x");
  const f2 = await upload(u2, "theirs.txt", "x");
  const mineId = await createShare(u1, f1);
  const theirsId = await createShare(u2, f2);
  const res = await SELF.fetch("https://example.com/api/shares/batch-revoke", {
    method: "POST",
    headers: { ...(await sessionHeaders(u1)), ...json },
    body: JSON.stringify({ ids: [mineId, theirsId] }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { revoked: number; failed: { id: string }[] };
  expect(body.revoked).toBe(1);
  expect(body.failed.map((f) => f.id)).toEqual([theirsId]);
  const row = await env.DB.prepare("SELECT revoked_at FROM shares WHERE id = ?1").bind(theirsId).first<{ revoked_at: number | null }>();
  expect(row!.revoked_at).toBeNull();
});

test("batch-revoke validates ids", async () => {
  const u = await seedUser();
  for (const ids of [[], ["", 1], Array.from({ length: 501 }, () => "x")]) {
    const res = await SELF.fetch("https://example.com/api/shares/batch-revoke", {
      method: "POST",
      headers: { ...(await sessionHeaders(u)), ...json },
      body: JSON.stringify({ ids }),
    });
    expect(res.status).toBe(400);
  }
});
