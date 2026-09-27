import { fetchMock, SELF } from "cloudflare:test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { seedUser, sessionHeaders } from "./helpers";

const R2_ORIGIN = "https://test-account.r2.cloudflarestorage.com";
const json = { "content-type": "application/json" };

// fetchMock 为 undici MockAgent：get(origin).intercept({ method, path }).reply(...)
// R2_ENDPOINT 含 bucket 前缀，节点 key 含随机 id，故 path 用 RegExp
function mockCreateMultipart() {
  fetchMock.get(R2_ORIGIN).intercept({
    method: "POST",
    path: /^\/mstor\/[^/]+\/[^/]+\?uploads=?$/,
  }).reply(200, "<InitiateMultipartUploadResult><Bucket>mstor</Bucket><Key>k</Key><UploadId>MPU-1</UploadId></InitiateMultipartUploadResult>", {
    headers: { "content-type": "application/xml" },
  });
}

function mockCompleteMultipart() {
  fetchMock.get(R2_ORIGIN).intercept({
    method: "POST",
    path: /^\/mstor\/[^/]+\/[^/]+\?uploadId=MPU-1$/,
  }).reply(200, `<CompleteMultipartUploadResult><Location>x</Location><Bucket>mstor</Bucket><Key>k</Key><ETag>"${"a".repeat(32)}"</ETag></CompleteMultipartUploadResult>`, {
    headers: { "content-type": "application/xml" },
  });
}

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.deactivate());

test("multipart init → part urls → complete creates node", async () => {
  const u = await seedUser();
  mockCreateMultipart();
  mockCompleteMultipart();
  const init = await SELF.fetch("https://example.com/api/uploads", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parentId: "", name: "movie.mp4", size: 200 * 1048576, mime: "video/mp4" }),
  });
  expect(init.status).toBe(201);
  const { uploadId, partSize } = (await init.json()) as { uploadId: string; partSize: number };
  expect(partSize).toBe(16 * 1048576);
  const parts = await SELF.fetch(`https://example.com/api/uploads/${uploadId}/part-urls`, {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ partNumbers: [1, 2] }),
  });
  expect(parts.status).toBe(200);
  const { urls } = (await parts.json()) as { urls: string[] };
  expect(urls).toHaveLength(2);
  expect(String(urls[0])).toContain("partNumber=1");
  expect(String(urls[0])).toContain("X-Amz-Signature=");
  // PUT part 请求由浏览器直传 R2，不经 Worker，无需 mock；etag 为 S3/R2 带双引号的 32 位 hex
  const done = await SELF.fetch(`https://example.com/api/uploads/${uploadId}/complete`, {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parts: [{ partNumber: 1, etag: `"${"a".repeat(32)}"` }, { partNumber: 2, etag: `"${"b".repeat(32)}"` }], mime: "video/mp4" }),
  });
  expect(done.status).toBe(201);
  const { nodeId, name } = (await done.json()) as { nodeId: string; name: string };
  expect(name).toBe("movie.mp4");
  const node = (await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json()) as { nodes: { size: number; mime: string }[] };
  expect(node.nodes[0].size).toBe(200 * 1048576);
  expect(node.nodes[0].mime).toBe("video/mp4");
});

test("small sizes are rejected (use direct upload)", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/uploads", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parentId: "", name: "tiny.txt", size: 100 }),
  });
  expect(res.status).toBe(400);
});

test("foreign uploadId is 404", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/uploads/nope/part-urls", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ partNumbers: [1] }),
  });
  expect(res.status).toBe(404);
});

test("abort deletes pending upload and aborts R2 multipart", async () => {
  const u = await seedUser();
  mockCreateMultipart();
  fetchMock.get(R2_ORIGIN).intercept({
    method: "DELETE",
    path: /^\/mstor\/[^/]+\/[^/]+\?uploadId=MPU-1$/,
  }).reply(204);
  const init = await SELF.fetch("https://example.com/api/uploads", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parentId: "", name: "movie.mp4", size: 200 * 1048576, mime: "video/mp4" }),
  });
  expect(init.status).toBe(201);
  const { uploadId } = (await init.json()) as { uploadId: string };
  const del = await SELF.fetch(`https://example.com/api/uploads/${uploadId}`, { method: "DELETE", headers: await sessionHeaders(u) });
  expect(del.status).toBe(200);
  expect(((await del.json()) as { ok: boolean }).ok).toBe(true);
  // 行已删，后续 part-urls 404
  const again = await SELF.fetch(`https://example.com/api/uploads/${uploadId}/part-urls`, {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ partNumbers: [1] }),
  });
  expect(again.status).toBe(404);
});

test("invalid etag is rejected with 400", async () => {
  const u = await seedUser();
  mockCreateMultipart();
  const init = await SELF.fetch("https://example.com/api/uploads", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parentId: "", name: "movie.mp4", size: 200 * 1048576, mime: "video/mp4" }),
  });
  expect(init.status).toBe(201);
  const { uploadId } = (await init.json()) as { uploadId: string };
  const res = await SELF.fetch(`https://example.com/api/uploads/${uploadId}/complete`, {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parts: [{ partNumber: 1, etag: "not-valid" }] }),
  });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("BAD_REQUEST");
});
