import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, davHeaders, sessionHeaders } from "./helpers";

async function upload(u: Awaited<ReturnType<typeof seedUser>>, name: string, body: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT", headers: await sessionHeaders(u), body,
  });
  return ((await res.json()) as { id: string }).id;
}

test("OPTIONS advertises DAV class 1,2", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/dav/", {
    method: "OPTIONS", headers: await davHeaders(u),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("dav")).toContain("1, 2");
});

test("dav requires valid basic auth", async () => {
  const res = await SELF.fetch("https://example.com/dav/", { method: "OPTIONS" });
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")).toContain("Basic");
});

test("PROPFIND depth 1 lists root children", async () => {
  const u = await seedUser();
  await upload(u, "dav.txt", "hello");
  const res = await SELF.fetch("https://example.com/dav/", {
    method: "PROPFIND",
    headers: { ...(await davHeaders(u)), depth: "1" },
  });
  expect(res.status).toBe(207);
  const xml = await res.text();
  expect(xml).toContain("<D:multistatus");
  expect(xml).toContain("dav.txt");
  expect(xml).toContain("<D:getcontentlength>5</D:getcontentlength>");
});

test("GET file with range via dav", async () => {
  const u = await seedUser();
  await upload(u, "dav.txt", "hello");
  const res = await SELF.fetch("https://example.com/dav/dav.txt", {
    headers: { ...(await davHeaders(u)), range: "bytes=1-3" },
  });
  expect(res.status).toBe(206);
  expect(await res.text()).toBe("ell");
});

test("PUT creates and replaces file", async () => {
  const u = await seedUser();
  const h = await davHeaders(u);
  expect((await SELF.fetch("https://example.com/dav/new.txt", { method: "PUT", headers: h, body: "v1" })).status).toBe(201);
  expect((await SELF.fetch("https://example.com/dav/new.txt", { method: "PUT", headers: h, body: "v2-longer" })).status).toBe(204);
  const list = (await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json()) as { nodes: { name: string; size: number | null }[] };
  expect(list.nodes[0].name).toBe("new.txt");
  expect(list.nodes[0].size).toBe(9);
});

test("PUT into missing directory returns 409", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/dav/no-dir/x.txt", {
    method: "PUT", headers: await davHeaders(u), body: "x",
  });
  expect(res.status).toBe(409);
});

test("trashed node is invisible to dav and its name stays occupied", async () => {
  const u = await seedUser();
  const id = await upload(u, "gone.txt", "bye");
  await SELF.fetch(`https://example.com/api/files/${id}`, { method: "DELETE", headers: await sessionHeaders(u) });
  const h = await davHeaders(u);
  const pf = await SELF.fetch("https://example.com/dav/", { method: "PROPFIND", headers: { ...h, depth: "1" } });
  expect(await pf.text()).not.toContain("gone.txt");
  expect((await SELF.fetch("https://example.com/dav/gone.txt", { headers: h })).status).toBe(404);
  expect((await SELF.fetch("https://example.com/dav/gone.txt", { method: "PUT", headers: h, body: "x" })).status).toBe(409);
});

test("dav PUT enforces quota", async () => {
  const u = await seedUser({ quota_bytes: 3 });
  const res = await SELF.fetch("https://example.com/dav/big.txt", {
    method: "PUT", headers: await davHeaders(u), body: "12345",
  });
  expect(res.status).toBe(403);
});

test("nested PUT lands under the subdir; subdir PROPFIND hrefs carry the prefix", async () => {
  const u = await seedUser();
  await SELF.fetch("https://example.com/api/dirs", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ parentId: "", name: "docs" }),
  });
  const h = await davHeaders(u);
  expect((await SELF.fetch("https://example.com/dav/docs/nested.txt", { method: "PUT", headers: h, body: "deep" })).status).toBe(201);
  const pf = await SELF.fetch("https://example.com/dav/docs", { method: "PROPFIND", headers: { ...h, depth: "1" } });
  expect(pf.status).toBe(207);
  const xml = await pf.text();
  expect(xml).toContain("<D:href>/dav/docs</D:href>");
  expect(xml).toContain("<D:href>/dav/docs/nested.txt</D:href>");
});

test("invalid node name and malformed percent-encoding are 400", async () => {
  const u = await seedUser();
  const h = await davHeaders(u);
  // 控制字符名：API 侧 validateNodeName 同款拒绝
  expect((await SELF.fetch("https://example.com/dav/bad%07name.txt", { method: "PUT", headers: h, body: "x" })).status).toBe(400);
  // 畸形百分号序列：URIError 应映射 400 而非 500
  expect((await SELF.fetch("https://example.com/dav/%zz.txt", { method: "PUT", headers: h, body: "x" })).status).toBe(400);
});
