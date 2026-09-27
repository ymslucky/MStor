import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, sessionHeaders } from "./helpers";
import type { UserRow } from "../server/types";

async function upload(u: UserRow, name: string, body: string, mime?: string) {
  const res = await SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), ...(mime ? { "content-type": mime } : {}) },
    body,
  });
  return ((await res.json()) as { id: string }).id;
}

test("GET content returns full body inline", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "hello world");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content`, { headers: await sessionHeaders(u) });
  expect(res.status).toBe(200);
  expect(res.headers.get("accept-ranges")).toBe("bytes");
  expect(res.headers.get("content-disposition")).toContain("inline");
  expect(await res.text()).toBe("hello world");
});

test("range bytes=0-4 returns 206 slice", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "hello world");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content`, {
    headers: { ...(await sessionHeaders(u)), range: "bytes=0-4" },
  });
  expect(res.status).toBe(206);
  expect(res.headers.get("content-range")).toBe("bytes 0-4/11");
  expect(res.headers.get("etag")).toBe(`"${id}"`);
  expect(await res.text()).toBe("hello");
});

test("suffix range bytes=-5 returns tail", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "hello world");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content`, {
    headers: { ...(await sessionHeaders(u)), range: "bytes=-5" },
  });
  expect(res.status).toBe(206);
  expect(await res.text()).toBe("world");
});

test("out-of-range returns 416", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "hi");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content`, {
    headers: { ...(await sessionHeaders(u)), range: "bytes=99-" },
  });
  expect(res.status).toBe(416);
});

test("dl=1 forces attachment", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "x");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content?dl=1`, { headers: await sessionHeaders(u) });
  expect(res.headers.get("content-disposition")).toContain("attachment");
  await res.arrayBuffer(); // 消费 R2 流，避免 vitest-pool-workers isolated storage 悬挂
});

test("html upload forces attachment with sandbox CSP", async () => {
  const u = await seedUser();
  const id = await upload(u, "evil.html", "<h1>x", "text/html");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content`, { headers: await sessionHeaders(u) });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toContain("attachment");
  expect(res.headers.get("content-security-policy")).toBe("sandbox");
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  await res.arrayBuffer(); // 消费 R2 流，避免 vitest-pool-workers isolated storage 悬挂
});

test("range end beyond size clamps to remainder", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "hello world");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content`, {
    headers: { ...(await sessionHeaders(u)), range: "bytes=0-999999999" },
  });
  expect(res.status).toBe(206);
  expect(await res.text()).toBe("hello world");
  expect(res.headers.get("content-range")).toBe("bytes 0-10/11");
  expect(res.headers.get("content-length")).toBe("11");
});

test("inverted and zero-suffix ranges return 416", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "hello world");
  for (const range of ["bytes=5-2", "bytes=-0"]) {
    const res = await SELF.fetch(`https://example.com/api/files/${id}/content`, {
      headers: { ...(await sessionHeaders(u)), range },
    });
    expect(res.status, range).toBe(416);
  }
});

test("multi-range falls back to full 200", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "hello world");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content`, {
    headers: { ...(await sessionHeaders(u)), range: "bytes=0-1,3-4" },
  });
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("hello world");
});
