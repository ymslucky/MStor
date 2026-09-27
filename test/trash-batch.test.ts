import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, sessionHeaders } from "./helpers";

const json = { "content-type": "application/json" };

type ListBody = { nodes: { id: string; name: string }[] };

async function upload(u: Awaited<ReturnType<typeof seedUser>>, name: string, body: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT", headers: await sessionHeaders(u), body,
  });
  return ((await res.json()) as { id: string }).id;
}

async function trashIds(u: Awaited<ReturnType<typeof seedUser>>): Promise<string[]> {
  const t = (await (await SELF.fetch("https://example.com/api/trash", { headers: await sessionHeaders(u) })).json()) as ListBody;
  return t.nodes.map((n) => n.id);
}

test("batch restore restores all ids", async () => {
  const u = await seedUser();
  const a = await upload(u, "a.txt", "a");
  const b = await upload(u, "b.txt", "b");
  await SELF.fetch(`https://example.com/api/files/${a}`, { method: "DELETE", headers: await sessionHeaders(u) });
  await SELF.fetch(`https://example.com/api/files/${b}`, { method: "DELETE", headers: await sessionHeaders(u) });
  const res = await SELF.fetch("https://example.com/api/trash/batch-restore", {
    method: "POST", headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ ids: [a, b] }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, restored: 2, failed: [] });
  const list = (await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json()) as ListBody;
  expect(list.nodes.map((n) => n.id).sort()).toEqual([a, b].sort());
});

test("batch restore tolerates missing ids and unknown ids", async () => {
  const u = await seedUser();
  const a = await upload(u, "a.txt", "a");
  await SELF.fetch(`https://example.com/api/files/${a}`, { method: "DELETE", headers: await sessionHeaders(u) });
  const res = await SELF.fetch("https://example.com/api/trash/batch-restore", {
    method: "POST", headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ ids: [a, "ghost-id"] }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { restored: number; failed: { id: string }[] };
  expect(body.restored).toBe(1);
  expect(body.failed.map((f) => f.id)).toEqual(["ghost-id"]);
});

test("batch purge removes nodes and R2 blobs, tolerates subtree repeats", async () => {
  const u = await seedUser();
  const dir = (await (await SELF.fetch("https://example.com/api/dirs", {
    method: "POST", headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ name: "d" }),
  })).json()) as { id: string };
  const fid = await upload(u, "f.txt", "payload");
  await SELF.fetch(`https://example.com/api/files/${fid}`, {
    method: "PATCH", headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parentId: dir.id }),
  });
  // 删除目录：dir + fid 一起进回收站
  await SELF.fetch(`https://example.com/api/files/${dir.id}`, { method: "DELETE", headers: await sessionHeaders(u) });
  const ids = await trashIds(u);
  expect(ids.sort()).toEqual([dir.id, fid].sort());

  const res = await SELF.fetch("https://example.com/api/trash/batch-purge", {
    method: "POST", headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ ids }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, purged: 2, failed: [] });
  // R2 对象与节点行一并清除
  expect(await env.BUCKET.get(`${u.id}/${fid}`)).toBeNull();
  expect(await env.DB.prepare("SELECT * FROM nodes WHERE id = ?1").bind(fid).first()).toBeNull();
  expect(await env.DB.prepare("SELECT * FROM nodes WHERE id = ?1").bind(dir.id).first()).toBeNull();
});

test("batch endpoints validate ids payload", async () => {
  const u = await seedUser();
  const headers = { ...(await sessionHeaders(u)), ...json };
  expect((await SELF.fetch("https://example.com/api/trash/batch-purge", {
    method: "POST", headers, body: JSON.stringify({ ids: [] }),
  })).status).toBe(400);
  expect((await SELF.fetch("https://example.com/api/trash/batch-restore", {
    method: "POST", headers, body: JSON.stringify({ ids: "a" }),
  })).status).toBe(400);
  expect((await SELF.fetch("https://example.com/api/trash/batch-restore", {
    method: "POST", headers, body: JSON.stringify({ ids: Array.from({ length: 501 }, (_, i) => `id${i}`) }),
  })).status).toBe(400);
});
