import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { purgeExpiredTrash } from "../server/routes/trash";
import { ensureRootDir } from "../server/lib/nodes";
import { seedUser, sessionHeaders } from "./helpers";

async function upload(u: Awaited<ReturnType<typeof seedUser>>, name: string, body: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT", headers: await sessionHeaders(u), body,
  });
  return ((await res.json()) as { id: string }).id;
}

test("delete → trash list → restore → permanent", async () => {
  const u = await seedUser();
  const fid = await upload(u, "f.txt", "data");
  const del = await SELF.fetch(`https://example.com/api/files/${fid}`, {
    method: "DELETE", headers: await sessionHeaders(u),
  });
  expect(del.status).toBe(200);

  const list = (await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json()) as { nodes: unknown[] };
  expect(list.nodes).toHaveLength(0);
  const t = (await (await SELF.fetch("https://example.com/api/trash", { headers: await sessionHeaders(u) })).json()) as { nodes: { id: string }[] };
  expect(t.nodes.map((n) => n.id)).toContain(fid);

  const restore = await SELF.fetch(`https://example.com/api/trash/${fid}/restore`, {
    method: "POST", headers: await sessionHeaders(u),
  });
  expect(restore.status).toBe(200);
  const list2 = (await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json()) as { nodes: { id: string; name: string }[] };
  expect(list2.nodes.map((n) => n.id)).toContain(fid);
  expect(list2.nodes.find((n) => n.id === fid)!.name).toBe("f.txt");

  // 彻底删除仅限回收站内节点：恢复后的活跃节点需先软删除回回收站
  expect((await SELF.fetch(`https://example.com/api/files/${fid}`, {
    method: "DELETE", headers: await sessionHeaders(u),
  })).status).toBe(200);
  expect((await SELF.fetch(`https://example.com/api/trash/${fid}`, {
    method: "DELETE", headers: await sessionHeaders(u),
  })).status).toBe(200);
  expect(await env.BUCKET.get(`${u.id}/${fid}`)).toBeNull();
  expect(await env.DB.prepare("SELECT * FROM nodes WHERE id = ?1").bind(fid).first()).toBeNull();
});

test("deleting a directory trashes the whole subtree", async () => {
  const u = await seedUser();
  const dir = (await (await SELF.fetch("https://example.com/api/dirs", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ parentId: "", name: "d" }),
  })).json()) as { id: string };
  const fid = await upload(u, "f.txt", "x");
  await SELF.fetch(`https://example.com/api/files/${fid}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ parentId: dir.id }),
  });
  await SELF.fetch(`https://example.com/api/files/${dir.id}`, { method: "DELETE", headers: await sessionHeaders(u) });
  const t = (await (await SELF.fetch("https://example.com/api/trash", { headers: await sessionHeaders(u) })).json()) as { nodes: { id: string }[] };
  expect(t.nodes.map((n) => n.id).sort()).toEqual([dir.id, fid].sort());
});

test("root cannot be trashed", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const res = await SELF.fetch(`https://example.com/api/files/${root.id}`, {
    method: "DELETE", headers: await sessionHeaders(u),
  });
  expect(res.status).toBe(400);
});

test("purgeExpiredTrash removes entries older than retention", async () => {
  const u = await seedUser();
  const fid = await upload(u, "old.txt", "old");
  await env.DB.prepare("UPDATE nodes SET deleted_at = ?1 WHERE id = ?2")
    .bind(Date.now() - 40 * 86400000, fid).run();
  await purgeExpiredTrash(env);
  expect(await env.DB.prepare("SELECT * FROM nodes WHERE id = ?1").bind(fid).first()).toBeNull();
});
