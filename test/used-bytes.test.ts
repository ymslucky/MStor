import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { sessionHeaders, seedUser } from "./helpers";

async function usedOf(userId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT used_bytes FROM users WHERE id = ?1").bind(userId).first<{ used_bytes: number }>();
  return row!.used_bytes;
}

test("直传上传后 used_bytes 增加，/api/me 返回值一致", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/files/upload?name=a.txt", {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-type": "text/plain" },
    body: "hello",
  });
  expect(res.status).toBe(201);
  expect(await usedOf(u.id)).toBe(5);
  const me = await SELF.fetch("https://example.com/api/me", { headers: await sessionHeaders(u) });
  expect(((await me.json()) as { usedBytes: number }).usedBytes).toBe(5);
});

test("秒传副本计入配额；软删扣减、还原加回", async () => {
  const u = await seedUser();
  const h = await sessionHeaders(u);
  const put = await SELF.fetch("https://example.com/api/files/upload?name=f.txt", {
    method: "PUT", headers: { ...h, "content-type": "text/plain", "x-file-sha256": "a".repeat(64) }, body: "12345",
  });
  expect(put.status).toBe(201);
  // 秒传命中：同 hash 同 size 再传一份
  const inst = await SELF.fetch("https://example.com/api/files/instant", {
    method: "POST", headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ name: "g.txt", size: 5, sha256: "a".repeat(64) }),
  });
  expect(inst.status).toBe(201);
  expect(await usedOf(u.id)).toBe(10);
  // 软删其中一份 → 扣减 5
  const { id } = (await inst.json()) as { id: string };
  await SELF.fetch(`https://example.com/api/files/${id}`, { method: "DELETE", headers: h });
  expect(await usedOf(u.id)).toBe(5);
  // 还原 → 加回 5
  await SELF.fetch(`https://example.com/api/trash/${id}/restore`, { method: "POST", headers: h });
  expect(await usedOf(u.id)).toBe(10);
});

test("目录软删扣减整棵子树文件大小；彻底删除不再重复扣减", async () => {
  const u = await seedUser();
  const h = await sessionHeaders(u);
  const mk = await SELF.fetch("https://example.com/api/dirs", {
    method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ name: "d" }),
  });
  const { id: dirId } = (await mk.json()) as { id: string };
  await SELF.fetch(`https://example.com/api/files/upload?parentId=${dirId}&name=a.txt`, {
    method: "PUT", headers: { ...h, "content-type": "text/plain" }, body: "0123456789",
  });
  expect(await usedOf(u.id)).toBe(10);
  await SELF.fetch(`https://example.com/api/files/${dirId}`, { method: "DELETE", headers: h });
  expect(await usedOf(u.id)).toBe(0);
  // 回收站彻底删除：已是删除态，配额不变
  await SELF.fetch(`https://example.com/api/trash/${dirId}`, { method: "DELETE", headers: h });
  expect(await usedOf(u.id)).toBe(0);
});
