import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi, beforeEach } from "vitest";
import { useUploadQueue } from "./useUploadQueue";

vi.mock("../api/uploads", () => ({
  uploadSmall: vi.fn(),
  uploadLarge: vi.fn(),
  abortUpload: vi.fn(),
  SMALL_FILE_LIMIT: 1024,
}));
vi.mock("../api/nodes", () => ({
  ensureDir: vi.fn(),
}));

import { ensureDir } from "../api/nodes";
import { abortUpload, uploadLarge, uploadSmall } from "../api/uploads";

// 模块级 mock 跨用例累积调用计数，每例清零（保留已设实现，各例自行覆写）
beforeEach(() => {
  vi.clearAllMocks();
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
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "d-photos");
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
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "d-2024");
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
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "");
});

test("plain File items (no path) behave as before", async () => {
  vi.mocked(uploadSmall).mockResolvedValue({ id: "n1", name: "a.txt", size: 5 });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("a.txt", 5)], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  expect(ensureDir).not.toHaveBeenCalled();
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "");
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
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "");
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
