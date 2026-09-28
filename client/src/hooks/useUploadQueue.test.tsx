import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi, beforeEach } from "vitest";
import { useUploadQueue } from "./useUploadQueue";

vi.mock("../api/uploads", () => ({
  uploadSmall: vi.fn(),
  uploadLarge: vi.fn(),
  abortUpload: vi.fn(),
  sha256Hex: vi.fn(),
  SMALL_FILE_LIMIT: 1024,
}));
vi.mock("../api/nodes", () => ({
  ensureDir: vi.fn(),
}));
vi.mock("../lib/resume", () => ({
  fingerprint: vi.fn((f: File, p: string) => `${f.name}:${f.size}:${p}`),
  loadResume: vi.fn(),
  saveResume: vi.fn(),
  clearResume: vi.fn(),
}));

import { ensureDir } from "../api/nodes";
import { abortUpload, sha256Hex, uploadLarge, uploadSmall } from "../api/uploads";
import { clearResume, loadResume, saveResume } from "../lib/resume";

// 模块级 mock 跨用例累积调用计数，每例清零（保留已设实现，各例自行覆写）
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadResume).mockReturnValue(null); // 清除上一用例泄漏的 mockReturnValue
  vi.mocked(sha256Hex).mockResolvedValue(null); // 秒传 hash 默认关，需要时各例覆写
});

function makeFile(name: string, size: number): File {
  const f = new File(["x".repeat(Math.min(size, 8))], name, { type: "text/plain" });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// —— 嵌套文件夹上传：path 逐级建目录后上传 ——

test("file with path ensures intermediate dirs then uploads into target", async () => {
  vi.mocked(ensureDir).mockResolvedValue({ id: "d-photos", parent_id: "", name: "photos", is_dir: 1, size: null, mime: null, created_at: 1, updated_at: 1 });
  vi.mocked(uploadSmall).mockResolvedValue({ id: "n1", name: "a.jpg", size: 5 });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([{ file: makeFile("a.jpg", 5), path: "photos/a.jpg" }], "root"));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  expect(ensureDir).toHaveBeenCalledWith({ parentId: "root", name: "photos" });
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "d-photos", expect.anything());
});

test("multi-level path creates dirs level by level", async () => {
  vi.mocked(ensureDir).mockImplementation(async ({ parentId, name }) => ({
    id: `d-${name}`, parent_id: parentId ?? "", name, is_dir: 1, size: null, mime: null, created_at: 1, updated_at: 1,
  }));
  vi.mocked(uploadSmall).mockResolvedValue({ id: "n1", name: "a.jpg", size: 5 });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([{ file: makeFile("a.jpg", 5), path: "p/2024/a.jpg" }], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  expect(ensureDir).toHaveBeenNthCalledWith(1, { name: "p" });
  expect(ensureDir).toHaveBeenNthCalledWith(2, { parentId: "d-p", name: "2024" });
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "d-2024", expect.anything());
});

test("same dir across files hits cache (ensureDir once)", async () => {
  vi.mocked(ensureDir).mockResolvedValue({ id: "d1", parent_id: "", name: "photos", is_dir: 1, size: null, mime: null, created_at: 1, updated_at: 1 });
  vi.mocked(uploadSmall).mockResolvedValue({ id: "n1", name: "a.jpg", size: 5 });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() =>
    result.current.add(
      [
        { file: makeFile("a.jpg", 5), path: "photos/a.jpg" },
        { file: makeFile("b.jpg", 5), path: "photos/b.jpg" },
      ],
      "",
    ),
  );
  await waitFor(() => expect(result.current.items.filter((i) => i.status === "done")).toHaveLength(2));
  expect(ensureDir).toHaveBeenCalledTimes(1);
});

test("top-level file (path = name only) skips dir creation", async () => {
  vi.mocked(uploadSmall).mockResolvedValue({ id: "n1", name: "a.txt", size: 5 });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([{ file: makeFile("a.txt", 5), path: "a.txt" }], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  expect(ensureDir).not.toHaveBeenCalled();
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "", expect.anything());
});

test("plain File items (no path) behave as before", async () => {
  vi.mocked(uploadSmall).mockResolvedValue({ id: "n1", name: "a.txt", size: 5 });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("a.txt", 5)], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  expect(ensureDir).not.toHaveBeenCalled();
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "", expect.anything());
});

test("dir creation failure marks item error with message", async () => {
  vi.mocked(ensureDir).mockRejectedValue(new Error("配额不足"));
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([{ file: makeFile("a.jpg", 5), path: "photos/a.jpg" }], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("error"));
  expect(result.current.items[0].error).toBe("配额不足");
  expect(uploadSmall).not.toHaveBeenCalled();
});

// —— 既有行为回归 ——

test("uploads files sequentially and marks done", async () => {
  vi.mocked(uploadSmall).mockResolvedValue({ id: "n1", name: "a.txt", size: 5 });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("a.txt", 5)], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "", expect.anything());
});

test("small upload reports progress through opts callback", async () => {
  vi.mocked(uploadSmall).mockImplementation(async (_f, _p, opts) => {
    opts?.onProgress?.(0.5);
    opts?.onProgress?.(1);
    return { id: "n1", name: "a.txt", size: 5 };
  });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("a.txt", 5)], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  // 收尾进度必达 1（中途 0.5 被 100ms 节流丢弃也允许，最终 ratio 恒为 1）
  expect(result.current.items[0].progress).toBe(1);
});

test("routes large files to uploadLarge and reports progress", async () => {
  vi.mocked(uploadLarge).mockImplementation(async (_f, _p, onProgress) => {
    onProgress?.(0.5);
    onProgress?.(1);
    return { nodeId: "n2", name: "big.bin" };
  });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("big.bin", 2048)], "d1"));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  expect(uploadLarge).toHaveBeenCalled();
  expect(result.current.items[0].progress).toBe(1);
});

test("failed upload is marked error and retry re-runs", async () => {
  vi.mocked(uploadSmall).mockRejectedValueOnce(new Error("配额不足")).mockResolvedValueOnce({ id: "n3", name: "a.txt", size: 5 });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("a.txt", 5)], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("error"));
  act(() => result.current.retry(result.current.items[0].key));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
});

test("cancel on small upload marks item 已取消 without server abortUpload", async () => {
  vi.mocked(uploadSmall).mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("a.txt", 5)], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("uploading"));
  act(() => result.current.cancel(result.current.items[0].key));
  expect(result.current.items[0].status).toBe("error");
  expect(result.current.items[0].error).toBe("已取消");
  expect(abortUpload).not.toHaveBeenCalled();
});

// —— 断点续传 ——

test("大文件暂停：不调 abortUpload，状态 paused，分片完成写入 resume", async () => {
  vi.mocked(uploadLarge).mockImplementation(async (_f, _p, _onProgress, _delay, opts) => {
    opts?.onUploadId?.("up-big");
    opts?.onPartDone?.({ partNumber: 1, etag: '"e1"' }, 1024);
    opts?.onPartDone?.({ partNumber: 2, etag: '"e2"' }, 1024);
    return new Promise(() => {}); // 挂起模拟传输中
  });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("big.bin", 4096)], "d1"));
  await waitFor(() => expect(result.current.items[0].status).toBe("uploading"));
  act(() => result.current.cancel(result.current.items[0].key));
  expect(result.current.items[0].status).toBe("paused");
  expect(result.current.items[0].fingerprint).toBe("big.bin:4096:d1");
  expect(abortUpload).not.toHaveBeenCalled(); // 暂停保留服务端分片
  expect(saveResume).toHaveBeenCalledWith("big.bin:4096:d1", {
    uploadId: "up-big", partSize: 1024,
    parts: [{ partNumber: 1, etag: '"e1"' }, { partNumber: 2, etag: '"e2"' }],
    done: 2048,
  });
});

test("retry 续传：loadResume 记录传给 uploadLarge，成功后 clearResume", async () => {
  vi.mocked(loadResume).mockReturnValue({ uploadId: "up-res", partSize: 1024, parts: [{ partNumber: 1, etag: '"e1"' }], done: 1024 });
  vi.mocked(uploadLarge).mockResolvedValue({ nodeId: "n9", name: "big.bin" });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("big.bin", 4096)], "d1"));
  act(() => result.current.retry(result.current.items[0].key));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  expect(uploadLarge).toHaveBeenCalledWith(expect.any(File), "d1", expect.anything(), 1000,
    expect.objectContaining({ resume: { uploadId: "up-res", partSize: 1024, parts: [{ partNumber: 1, etag: '"e1"' }] } }));
  expect(clearResume).toHaveBeenCalledWith("big.bin:4096:d1");
});

test("失败（非取消）保留 resume，供 retry 续传", async () => {
  vi.mocked(uploadLarge).mockImplementation(async (_f, _p, _onProgress, _delay, opts) => {
    opts?.onUploadId?.("up-f");
    opts?.onPartDone?.({ partNumber: 1, etag: '"e1"' }, 1024);
    throw new Error("网络错误");
  });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("big.bin", 4096)], "d1"));
  await waitFor(() => expect(result.current.items[0].status).toBe("error"));
  expect(saveResume).toHaveBeenCalledWith("big.bin:4096:d1", {
    uploadId: "up-f", partSize: 1024, parts: [{ partNumber: 1, etag: '"e1"' }], done: 1024,
  });
});

test("彻底取消 purge：abortUpload + clearResume + 移除队列项", async () => {
  vi.mocked(uploadLarge).mockImplementation(async (_f, _p, _onProgress, _delay, opts) => {
    opts?.onUploadId?.("up-p");
    return new Promise(() => {});
  });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("big.bin", 4096)], "d1"));
  await waitFor(() => expect(result.current.items[0].status).toBe("uploading"));
  act(() => result.current.purge(result.current.items[0].key));
  expect(abortUpload).toHaveBeenCalledWith("up-p");
  expect(clearResume).toHaveBeenCalledWith("big.bin:4096:d1");
  expect(result.current.items).toHaveLength(0);
});

test("clearFinished 保留 paused 项", async () => {
  vi.mocked(uploadLarge).mockImplementation(async (_f, _p, _onProgress, _delay, opts) => {
    opts?.onUploadId?.("up-q");
    return new Promise(() => {});
  });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("big.bin", 4096)], "d1"));
  await waitFor(() => expect(result.current.items[0].status).toBe("uploading"));
  act(() => result.current.cancel(result.current.items[0].key));
  act(() => result.current.clearFinished());
  expect(result.current.items).toHaveLength(1);
  expect(result.current.items[0].status).toBe("paused");
});

// —— 秒传 ——

test("小文件上传前计算 SHA-256 传给 uploadSmall", async () => {
  vi.mocked(sha256Hex).mockResolvedValue("b".repeat(64));
  vi.mocked(uploadSmall).mockResolvedValue({ id: "n1", name: "a.txt", size: 5 });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("a.txt", 5)], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "", expect.objectContaining({ sha256: "b".repeat(64) }));
});

test("SHA-256 计算失败时跳过秒传头正常上传", async () => {
  vi.mocked(sha256Hex).mockRejectedValue(new Error("crypto 不可用"));
  vi.mocked(uploadSmall).mockResolvedValue({ id: "n1", name: "a.txt", size: 5 });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("a.txt", 5)], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "", expect.objectContaining({ sha256: undefined }));
});
