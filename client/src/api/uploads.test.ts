import { afterEach, expect, test, vi } from "vitest";
import { SMALL_FILE_LIMIT, uploadLarge } from "./uploads";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeFile(name: string, size: number): File {
  const f = new File([new Uint8Array(Math.min(size, 16))], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("multipart flow: init, part-urls, direct PUT with etag, complete", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/uploads" && init?.method === "POST")
      return jsonRes({ uploadId: "up1", partSize: 8 }, 201);
    if (url === "/api/uploads/up1/part-urls")
      return jsonRes({ urls: [`https://r2.example/put?part=${JSON.parse(String(init?.body)).partNumbers[0] ?? ""}`] });
    if (url.startsWith("https://r2.example/put"))
      return new Response(null, { status: 200, headers: { etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' } });
    if (url === "/api/uploads/up1/complete")
      return jsonRes({ nodeId: "n1", name: "big.bin" }, 201);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const res = await uploadLarge(makeFile("big.bin", 20), "d1", undefined, 0);
  expect(res).toEqual({ nodeId: "n1", name: "big.bin" });
  // 3 个分片（20B / 8B = ceil 2.5 → 3）
  const partCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("https://r2.example/put"));
  expect(partCalls).toHaveLength(3);
  const complete = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/uploads/up1/complete");
  const body = JSON.parse(String(complete![1]!.body)) as { parts: { partNumber: number; etag: string }[] };
  expect(body.parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
  expect(body.parts.every((p) => /^"[0-9a-f]{32}"$/.test(p.etag))).toBe(true);
});

test("part PUT failure retries then throws after 3 attempts", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/uploads") return jsonRes({ uploadId: "up2", partSize: 8 }, 201);
    if (url.endsWith("/part-urls")) return jsonRes({ urls: ["https://r2.example/fail"] });
    if (url.startsWith("https://r2.example/fail")) return new Response("err", { status: 500 });
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  // 文件 8B / partSize 8 → 恰 1 个分片，重试计数才确定（多分片时 Promise.all 提前 reject，计数不定）
  await expect(uploadLarge(makeFile("big.bin", 8), "", undefined, 0)).rejects.toThrow("分片");
  // 1 次 init + 3 次 part-urls + 3 次 PUT = 7
  expect(fetchMock).toHaveBeenCalledTimes(7);
});

test("SMALL_FILE_LIMIT matches backend 60MB", () => {
  expect(SMALL_FILE_LIMIT).toBe(60 * 1024 * 1024);
});
