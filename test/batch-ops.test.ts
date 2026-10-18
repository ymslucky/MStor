import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedNode, seedUser, sessionHeaders } from "./helpers";
import { sweepOrphanObjects } from "../server/routes/trash";

async function upload(u: Awaited<ReturnType<typeof seedUser>>, name: string, body: string) {
  const res = await SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-type": "text/plain" },
    body,
  });
  return ((await res.json()) as { id: string }).id;
}

test("POST /api/files/batch-delete 软删：全部进回收站", async () => {
  const u = await seedUser();
  const a = await upload(u, "a.txt", "a");
  const b = await upload(u, "b.txt", "b");
  const res = await SELF.fetch("https://example.com/api/files/batch-delete", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ ids: [a, b] }),
  });
  const body = (await res.json()) as { deleted: number; failed: unknown[] };
  expect(body.deleted).toBe(2);
  expect(body.failed).toHaveLength(0);
  // 活跃列表为空，回收站 2 项
  const files = (await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json()) as { nodes: unknown[] };
  expect(files.nodes).toHaveLength(0);
  const trash = (await (await SELF.fetch("https://example.com/api/trash", { headers: await sessionHeaders(u) })).json()) as { nodes: unknown[] };
  expect(trash.nodes).toHaveLength(2);
});

test("POST /api/files/batch-delete permanent：对象清理、不存在的 id 静默忽略", async () => {
  const u = await seedUser();
  const a = await upload(u, "a.txt", "a");
  const res = await SELF.fetch("https://example.com/api/files/batch-delete", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ ids: [a, "nonexistent"], permanent: true }),
  });
  const body = (await res.json()) as { deleted: number; failed: unknown[] };
  expect(body.deleted).toBe(1); // 集合式删除：实际存在的根计数，不存在的 id 静默忽略
  expect(body.failed).toHaveLength(0);
  await sweepOrphanObjects(env, 0);
  expect((await env.BUCKET.list()).objects).toHaveLength(0);
});

test("POST /api/files/batch-move 移入目标目录", async () => {
  const u = await seedUser();
  const dir = ((await (
    await SELF.fetch("https://example.com/api/dirs", {
      method: "POST",
      headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
      body: JSON.stringify({ name: "docs" }),
    })
  ).json()) as { id: string }).id;
  const a = await upload(u, "a.txt", "a");
  const b = await upload(u, "b.txt", "b");
  const res = await SELF.fetch("https://example.com/api/files/batch-move", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ ids: [a, b], parentId: dir }),
  });
  const body = (await res.json()) as { moved: number; failed: unknown[] };
  expect(body.moved).toBe(2);
  expect(body.failed).toHaveLength(0);
  const inDir = (await (await SELF.fetch(`https://example.com/api/files?parentId=${dir}`, { headers: await sessionHeaders(u) })).json()) as { nodes: unknown[] };
  expect(inDir.nodes).toHaveLength(2);
});

test("POST /api/files/batch-move 目标不是目录返回 404", async () => {
  const u = await seedUser();
  const a = await upload(u, "a.txt", "a");
  const res = await SELF.fetch("https://example.com/api/files/batch-move", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ ids: [a], parentId: a }),
  });
  expect(res.status).toBe(404);
});

test("POST /api/files/batch-move 100 项：修复 D1 绑定参数上限（曾 ≥50 项整体 500）", async () => {
  const u = await seedUser();
  const dir = await seedNode({ owner_id: u.id, is_dir: 1, name: "docs" });
  const ids: string[] = [];
  for (let i = 0; i < 100; i++) ids.push((await seedNode({ owner_id: u.id, name: `f${i}.txt` })).id);
  const res = await SELF.fetch("https://example.com/api/files/batch-move", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ ids, parentId: dir.id }),
  });
  expect(res.status).toBe(200);
  expect(((await res.json()) as { moved: number }).moved).toBe(100);
  const inDir = (await (await SELF.fetch(`https://example.com/api/files?parentId=${dir.id}`, { headers: await sessionHeaders(u) })).json()) as { nodes: unknown[] };
  expect(inDir.nodes).toHaveLength(100);
});

test("POST /api/files/batch-move 原地移动：所选自身不算同名冲突（idSet 排除回归）", async () => {
  const u = await seedUser();
  const a = await seedNode({ owner_id: u.id, name: "a.txt" });
  const b = await seedNode({ owner_id: u.id, name: "b.txt" });
  const res = await SELF.fetch("https://example.com/api/files/batch-move", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ ids: [a.id, b.id], parentId: "" }),
  });
  expect(res.status).toBe(200);
  expect(((await res.json()) as { moved: number }).moved).toBe(2);
});

test("POST /api/files/batch-move 目标同名仍整批 409", async () => {
  const u = await seedUser();
  const dir = await seedNode({ owner_id: u.id, is_dir: 1, name: "docs" });
  await seedNode({ owner_id: u.id, parent_id: dir.id, name: "dup.txt" });
  const src = await seedNode({ owner_id: u.id, name: "dup.txt" });
  const res = await SELF.fetch("https://example.com/api/files/batch-move", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ ids: [src.id], parentId: dir.id }),
  });
  expect(res.status).toBe(409);
});

test("POST /api/files/batch-delete ids 不合法返回 400", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/files/batch-delete", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ ids: [] }),
  });
  expect(res.status).toBe(400);
});
