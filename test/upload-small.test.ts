import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, sessionHeaders } from "./helpers";

test("PUT /api/files/upload streams to R2 and creates node", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/files/upload?name=hello.txt", {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-type": "text/plain" },
    body: "hello",
  });
  expect(res.status).toBe(201);
  const { id, name } = (await res.json()) as { id: string; name: string };
  expect(name).toBe("hello.txt");
  const obj = await env.BUCKET.get(`${u.id}/${id}`);
  expect(await obj?.text()).toBe("hello");
  const list = await (
    await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })
  ).json() as { nodes: { size: number | null; mime: string | null }[] };
  expect(list.nodes[0].size).toBe(5);
  expect(list.nodes[0].mime).toBe("text/plain");
});

test("duplicate name auto-renames to 'a (2).txt'", async () => {
  const u = await seedUser();
  const put = async (name: string) => SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT", headers: await sessionHeaders(u), body: "x",
  });
  await put("a.txt");
  const res = await put("a.txt");
  const { name } = (await res.json()) as { name: string };
  expect(name).toBe("a (2).txt");
});

test("quota exceeded returns 403 QUOTA_EXCEEDED 且不残留 R2 对象", async () => {
  const u = await seedUser({ quota_bytes: 3 });
  const res = await SELF.fetch("https://example.com/api/files/upload?name=big.txt", {
    method: "PUT", headers: await sessionHeaders(u), body: "12345",
  });
  expect(res.status).toBe(403);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("QUOTA_EXCEEDED");
  // 回归：配额拒绝后对象必须回滚，否则可反复制造无人引用、也不在 orphan_objects 的永久孤儿
  expect((await env.BUCKET.list()).objects).toHaveLength(0);
  const files = (await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json()) as { nodes: unknown[] };
  expect(files.nodes).toHaveLength(0);
});

test("oversize Content-Length rejected before reading body", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/files/upload?name=huge.bin", {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-length": "999999999999" },
  });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("BAD_REQUEST");
});
