import { afterEach, expect, test, vi } from "vitest";
import { SMALL_FILE_LIMIT, uploadLarge, uploadSmall } from "./uploads";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  FakePartXhr.sent.length = 0;
  FakePartXhr.failCount = 0;
  FakePartXhr.inFlight = 0;
  FakePartXhr.maxInFlight = 0;
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

// —— 分片直传 XHR 假件：send 后微任务里自动发一条 progress 并完成 ——
class FakePartXhr {
  static sent: FakePartXhr[] = [];
  static failCount = 0; // 前 N 次返回 500（测重试）
  static inFlight = 0;
  static maxInFlight = 0;
  status = 200;
  responseText = "";
  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open() {}
  getResponseHeader(h: string) {
    return h.toLowerCase() === "etag" && this.status === 200 ? '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' : null;
  }
  send() {
    const idx = FakePartXhr.sent.push(this) - 1;
    FakePartXhr.inFlight++;
    FakePartXhr.maxInFlight = Math.max(FakePartXhr.maxInFlight, FakePartXhr.inFlight);
    queueMicrotask(() => {
      FakePartXhr.inFlight--;
      if (idx < FakePartXhr.failCount) {
        this.status = 500;
      } else {
        this.status = 200;
        // loaded 4 / total 8：中间进度可断言
        this.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 8 });
      }
      this.onload?.();
    });
  }
  abort() {
    this.onabort?.();
  }
}

test("multipart flow: init, part-urls, XHR PUT with etag and progress, complete", async () => {
  vi.stubGlobal("XMLHttpRequest", FakePartXhr);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/uploads" && init?.method === "POST")
      return jsonRes({ uploadId: "up1", partSize: 8 }, 201);
    if (url === "/api/uploads/up1/part-urls")
      return jsonRes({ urls: [`https://r2.example/put?part=${JSON.parse(String(init?.body)).partNumbers[0] ?? ""}`] });
    if (url === "/api/uploads/up1/complete")
      return jsonRes({ nodeId: "n1", name: "big.bin" }, 201);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const progress: number[] = [];
  const res = await uploadLarge(makeFile("big.bin", 20), "d1", (r) => progress.push(r), 0);
  expect(res).toEqual({ nodeId: "n1", name: "big.bin" });
  // 3 个分片（20B / 8B = ceil 2.5 → 3），全部走 XHR（fetch 只处理 API 调用）
  expect(FakePartXhr.sent).toHaveLength(3);
  const partCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("https://r2.example"));
  expect(partCalls).toHaveLength(0);
  const complete = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/uploads/up1/complete");
  const body = JSON.parse(String(complete![1]!.body)) as { parts: { partNumber: number; etag: string }[] };
  expect(body.parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
  expect(body.parts.every((p) => /^"[0-9a-f]{32}"$/.test(p.etag))).toBe(true);
  // 字节级聚合进度：3 分片并发各传 4B → 中间值（>0 且 <1），收尾 1
  expect(progress.at(-1)).toBe(1);
  expect(progress.some((r) => r > 0 && r < 1)).toBe(true);
  expect(progress.every((r) => r >= 0 && r <= 1)).toBe(true);
});

test("part PUT failure retries then throws after 3 attempts", async () => {
  vi.stubGlobal("XMLHttpRequest", FakePartXhr);
  FakePartXhr.failCount = 3; // 前 3 次全部 500
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/uploads") return jsonRes({ uploadId: "up2", partSize: 8 }, 201);
    if (url.endsWith("/part-urls")) return jsonRes({ urls: ["https://r2.example/put"] });
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  // 文件 8B / partSize 8 → 恰 1 个分片，重试计数才确定（多分片时 Promise.all 提前 reject，计数不定）
  await expect(uploadLarge(makeFile("big.bin", 8), "", undefined, 0)).rejects.toThrow("分片");
  // PUT 走 XHR：fetch 只有 init(1) + part-urls(3) = 4 次
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(FakePartXhr.sent).toHaveLength(3);
  FakePartXhr.failCount = 0;
});

test("resume 续传：跳过已传分片，不调 init，complete 合并 parts", async () => {
  vi.stubGlobal("XMLHttpRequest", FakePartXhr);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/part-urls")) return jsonRes({ urls: ["https://r2.example/put"] });
    if (url.endsWith("/complete")) return jsonRes({ nodeId: "n5", name: "big.bin" }, 201);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const progress: number[] = [];
  // 4 分片（32B/8B）已传 2 个，恢复后只传剩余 2 个
  await uploadLarge(makeFile("big.bin", 32), "d1", (r) => progress.push(r), 0, {
    resume: { uploadId: "up9", partSize: 8, parts: [{ partNumber: 1, etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' }, { partNumber: 2, etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' }] },
  });
  expect(FakePartXhr.sent).toHaveLength(2); // 只传分片 3、4
  expect(fetchMock).not.toHaveBeenCalledWith("/api/uploads", expect.anything()); // 不调 init
  const complete = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/complete"));
  const body = JSON.parse(String(complete![1]!.body)) as { parts: { partNumber: number }[] };
  expect(body.parts.map((p) => p.partNumber)).toEqual([1, 2, 3, 4]);
  // 进度以已传分片为基数起步
  expect(progress[0]).toBeGreaterThanOrEqual(0.5);
  expect(progress.at(-1)).toBe(1);
});

test("resume 进度基数：已传 3/4 分片起步即 ≥75%", async () => {
  vi.stubGlobal("XMLHttpRequest", FakePartXhr);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/part-urls")) return jsonRes({ urls: ["https://r2.example/put"] });
    if (url.endsWith("/complete")) return jsonRes({ nodeId: "n6", name: "big.bin" }, 201);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const progress: number[] = [];
  await uploadLarge(makeFile("big.bin", 32), "d1", (r) => progress.push(r), 0, {
    resume: { uploadId: "up10", partSize: 8, parts: [{ partNumber: 1, etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' }, { partNumber: 2, etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' }, { partNumber: 3, etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' }] },
  });
  expect(progress[0]).toBeGreaterThanOrEqual(0.75);
});


test("并发数生效：concurrency 4 时 4 分片同时在途", async () => {
  vi.stubGlobal("XMLHttpRequest", FakePartXhr);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/uploads") return jsonRes({ uploadId: "up3", partSize: 8 }, 201);
    if (url.endsWith("/part-urls")) return jsonRes({ urls: ["https://r2.example/put"] });
    if (url.endsWith("/complete")) return jsonRes({ nodeId: "n3", name: "big.bin" }, 201);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  // 32B / 8B = 4 分片，concurrency 4 → 峰值在途 4
  await uploadLarge(makeFile("big.bin", 32), "", undefined, 0, { concurrency: 4 });
  expect(FakePartXhr.sent).toHaveLength(4);
  expect(FakePartXhr.maxInFlight).toBe(4);
});

test("并发数默认 3：5 分片时峰值在途 3", async () => {
  vi.stubGlobal("XMLHttpRequest", FakePartXhr);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/uploads") return jsonRes({ uploadId: "up4", partSize: 8 }, 201);
    if (url.endsWith("/part-urls")) return jsonRes({ urls: ["https://r2.example/put"] });
    if (url.endsWith("/complete")) return jsonRes({ nodeId: "n4", name: "big.bin" }, 201);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  await uploadLarge(makeFile("big.bin", 40), "", undefined, 0);
  expect(FakePartXhr.sent).toHaveLength(5);
  expect(FakePartXhr.maxInFlight).toBe(3);
});
