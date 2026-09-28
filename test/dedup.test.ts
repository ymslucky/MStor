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
