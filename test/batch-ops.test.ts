import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, sessionHeaders } from "./helpers";

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

test("POST /api/files/batch-delete permanent：对象清理、不存在的 id 记入 failed", async () => {
  const u = await seedUser();
  const a = await upload(u, "a.txt", "a");
  const res = await SELF.fetch("https://example.com/api/files/batch-delete", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ ids: [a, "nonexistent"], permanent: true }),
  });
  const body = (await res.json()) as { deleted: number; failed: { id: string }[] };
  expect(body.deleted).toBe(1);
  expect(body.failed.map((f) => f.id)).toEqual(["nonexistent"]);
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

test("POST /api/files/batch-delete ids 不合法返回 400", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/files/batch-delete", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ ids: [] }),
  });
  expect(res.status).toBe(400);
});
