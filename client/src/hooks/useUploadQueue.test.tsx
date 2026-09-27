import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { useUploadQueue } from "./useUploadQueue";

vi.mock("../api/uploads", () => ({
  uploadSmall: vi.fn(),
  uploadLarge: vi.fn(),
  SMALL_FILE_LIMIT: 1024,
}));

import { uploadLarge, uploadSmall } from "../api/uploads";

function makeFile(name: string, size: number): File {
  const f = new File(["x".repeat(Math.min(size, 8))], name, { type: "text/plain" });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

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

test("invalidates files and me queries after success", async () => {
  vi.mocked(uploadSmall).mockResolvedValue({ id: "n1", name: "a.txt", size: 5 });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  const { result } = renderHook(() => useUploadQueue(), {
    wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
  act(() => result.current.add([makeFile("a.txt", 5)], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  await waitFor(() => {
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey?: string[] })?.queryKey);
    expect(keys.some((k) => k?.[0] === "files")).toBe(true);
    expect(keys.some((k) => k?.[0] === "me")).toBe(true);
  });
});
