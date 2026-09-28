import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, sessionHeaders } from "./helpers";

const SHA = "a".repeat(64);

test("同 hash 同 size 二次直传秒传：deduplicated 且 R2 无新对象", async () => {
  const u = await seedUser();
  const put = async (name: string) => SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-type": "text/plain", "x-file-sha256": SHA },
    body: "hello",
  });
  const r1 = await put("a.txt");
  expect(r1.status).toBe(201);
  const r2 = await put("b.txt");
  expect(r2.status).toBe(201);
  expect(((await r2.json()) as { deduplicated?: boolean }).deduplicated).toBe(true);
  // R2 只有 1 个对象（第二个复用第一个的 r2_key）
  const list = await env.BUCKET.list();
  expect(list.objects).toHaveLength(1);
  // 两个 node 都在，第二个内容可读
  const files = await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json() as {
    nodes: { id: string; name: string }[];
  };
  expect(files.nodes).toHaveLength(2);
  const second = files.nodes.find((n) => n.name === "b.txt")!;
  const content = await SELF.fetch(`https://example.com/api/files/${second.id}/content`, { headers: await sessionHeaders(u) });
  expect(await content.text()).toBe("hello");
});

test("hash 命中但 size 不等不秒传", async () => {
  const u = await seedUser();
  const headers = { ...(await sessionHeaders(u)), "content-type": "text/plain", "x-file-sha256": SHA };
  await SELF.fetch("https://example.com/api/files/upload?name=a.txt", { method: "PUT", headers, body: "hello" });
  const res = await SELF.fetch("https://example.com/api/files/upload?name=b.txt", { method: "PUT", headers, body: "hi" });
  expect(((await res.json()) as { deduplicated?: boolean }).deduplicated).toBeUndefined();
  expect((await env.BUCKET.list()).objects).toHaveLength(2);
});

test("sha256 写入 nodes：直传后记录 hash", async () => {
  const u = await seedUser();
  await SELF.fetch("https://example.com/api/files/upload?name=a.txt", {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-type": "text/plain", "x-file-sha256": SHA },
    body: "hello",
  });
  const row = await env.DB.prepare("SELECT sha256 FROM nodes WHERE name = 'a.txt'").first<{ sha256: string | null }>();
  expect(row?.sha256).toBe(SHA);
});

// —— instant 秒传（先查后传，不发文件体）——

test("POST /api/files/instant 命中即建 node，复用 R2 对象", async () => {
  const u = await seedUser();
  // 第一份：正常直传（写入 sha256）
  const first = ((await (
    await SELF.fetch("https://example.com/api/files/upload?name=a.txt", {
      method: "PUT",
      headers: { ...(await sessionHeaders(u)), "content-type": "text/plain", "x-file-sha256": SHA },
      body: "hello",
    })
  ).json()) as { id: string }).id;
  // 第二份：instant 秒传
  const res = await SELF.fetch("https://example.com/api/files/instant", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ name: "b.txt", parentId: "", size: 5, sha256: SHA }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string; deduplicated: boolean };
  expect(body.deduplicated).toBe(true);
  // R2 仍只有 1 个对象；两个 node 指向同一 r2_key
  expect((await env.BUCKET.list()).objects).toHaveLength(1);
  const rows = await env.DB.prepare("SELECT id, r2_key FROM nodes WHERE deleted_at IS NULL").all<{ id: string; r2_key: string }>();
  const a = rows.results.find((r) => r.id === first)!;
  const b = rows.results.find((r) => r.id === body.id)!;
  expect(b.r2_key).toBe(a.r2_key);
  // 秒传副本内容可正常下载
  const content = await SELF.fetch(`https://example.com/api/files/${body.id}/content`, { headers: await sessionHeaders(u) });
  expect(await content.text()).toBe("hello");
});

test("POST /api/files/instant 未命中返回 404 NO_DEDUP", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/files/instant", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ name: "x.txt", parentId: "", size: 5, sha256: SHA }),
  });
  expect(res.status).toBe(404);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NO_DEDUP");
});

test("POST /api/files/instant 不允许跨用户领取他人文件（hash 非持有性证明）", async () => {
  const owner = await seedUser();
  await SELF.fetch("https://example.com/api/files/upload?name=secret.txt", {
    method: "PUT",
    headers: { ...(await sessionHeaders(owner)), "content-type": "text/plain", "x-file-sha256": SHA },
    body: "hello",
  });
  // 另一个用户拿到相同 hash+size（hash 可能随日志/清单泄露），尝试秒传领取
  const attacker = await seedUser();
  const res = await SELF.fetch("https://example.com/api/files/instant", {
    method: "POST",
    headers: { ...(await sessionHeaders(attacker)), "content-type": "application/json" },
    body: JSON.stringify({ name: "mine.txt", parentId: "", size: 5, sha256: SHA }),
  });
  expect(res.status).toBe(404); // 未命中：不建 node，无法读取他人对象
});

test("POST /api/files/instant 参数不合法返回 400", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/files/instant", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ name: "x.txt", parentId: "", size: 5, sha256: "bad" }),
  });
  expect(res.status).toBe(400);
});

test("删除秒传副本后原文件仍可下载；两份都删后 R2 对象被清", async () => {
  const u = await seedUser();
  const put = async (name: string) => SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-type": "text/plain", "x-file-sha256": SHA },
    body: "hello",
  });
  const n1 = ((await (await put("a.txt")).json()) as { id: string }).id;
  const n2 = ((await (await put("b.txt")).json()) as { id: string }).id;
  // 软删 + 彻底删第一份
  await SELF.fetch(`https://example.com/api/files/${n1}`, { method: "DELETE", headers: await sessionHeaders(u) });
  await SELF.fetch(`https://example.com/api/trash/${n1}`, { method: "DELETE", headers: await sessionHeaders(u) });
  const content = await SELF.fetch(`https://example.com/api/files/${n2}/content`, { headers: await sessionHeaders(u) });
  expect(await content.text()).toBe("hello"); // 原对象未被误删
  expect((await env.BUCKET.list()).objects).toHaveLength(1);
  // 第二份也彻底删 → 对象清理
  await SELF.fetch(`https://example.com/api/files/${n2}`, { method: "DELETE", headers: await sessionHeaders(u) });
  await SELF.fetch(`https://example.com/api/trash/${n2}`, { method: "DELETE", headers: await sessionHeaders(u) });
  expect((await env.BUCKET.list()).objects).toHaveLength(0);
});
