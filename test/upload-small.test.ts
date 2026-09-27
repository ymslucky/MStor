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

test("quota exceeded returns 403 QUOTA_EXCEEDED", async () => {
  const u = await seedUser({ quota_bytes: 3 });
  const res = await SELF.fetch("https://example.com/api/files/upload?name=big.txt", {
    method: "PUT", headers: await sessionHeaders(u), body: "12345",
  });
  expect(res.status).toBe(403);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("QUOTA_EXCEEDED");
});

test("oversize Content-Length rejected before reading body", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/files/upload?name=huge.bin", {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-length": "999999999999" },
  });
  expect(res.status).toBe(400);
});
