import { afterEach, expect, test, vi } from "vitest";
import { SMALL_FILE_LIMIT, uploadLarge, uploadSmall } from "./uploads";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// —— uploadSmall XHR 假件 ——
class FakeXhr {
  static last: FakeXhr | null = null;
  status = 200;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  headers: Record<string, string> = {};
  method = "";
  url = "";
  body: unknown = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(body: unknown) {
    this.body = body;
    FakeXhr.last = this;
  }
  abort() {
    this.onabort?.();
  }
}

test("uploadSmall 走 XHR：PUT 地址、头、进度回调、结果解析", async () => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  const ratios: number[] = [];
  const p = uploadSmall(new File(["abc"], "a.txt", { type: "text/plain" }), "d1", {
    onProgress: (r) => ratios.push(r),
  });
  const xhr = FakeXhr.last!;
  expect(xhr.method).toBe("PUT");
  expect(xhr.url).toContain("/api/files/upload?");
  expect(xhr.url).toContain("name=a.txt");
  expect(xhr.url).toContain("parentId=d1");
  expect(xhr.headers["content-type"]).toBe("text/plain");
  xhr.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 3 });
  xhr.responseText = JSON.stringify({ id: "n1", name: "a.txt", size: 3 });
  xhr.onload?.();
  await expect(p).resolves.toEqual({ id: "n1", name: "a.txt", size: 3 });
  expect(ratios).toEqual([2 / 3]);
});

test("uploadSmall 401 映射 ApiError 请先登录", async () => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  const p = uploadSmall(new File(["x"], "a.txt"), "d1");
  const xhr = FakeXhr.last!;
  xhr.status = 401;
  xhr.responseText = JSON.stringify({ error: { code: "UNAUTHORIZED", message: "请先登录" } });
  xhr.onload?.();
  await expect(p).rejects.toThrow("请先登录");
});

test("uploadSmall 非 2xx 解析错误 envelope", async () => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  const p = uploadSmall(new File(["x"], "a.txt"), "d1");
  const xhr = FakeXhr.last!;
  xhr.status = 413;
  xhr.responseText = JSON.stringify({ error: { code: "PAYLOAD_TOO_LARGE", message: "文件过大" } });
  xhr.onload?.();
  await expect(p).rejects.toThrow("文件过大");
});

test("uploadSmall signal 中止抛 AbortError", async () => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  const ctrl = new AbortController();
  const p = uploadSmall(new File(["x"], "a.txt"), "d1", { signal: ctrl.signal });
  ctrl.abort();
  await expect(p).rejects.toMatchObject({ name: "AbortError" });
});

test("uploadSmall 携带 x-act-as 头", async () => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  localStorage.setItem("mstor_act_as", "user-2");
  try {
    uploadSmall(new File(["x"], "a.txt"), "d1");
    expect(FakeXhr.last!.headers["x-act-as"]).toBe("user-2");
  } finally {
    localStorage.removeItem("mstor_act_as");
  }
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
