import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { Node } from "../api/types";
import { STORAGE_KEYS } from "../lib/storage";
import { useBrowserUpload } from "./useBrowserUpload";

const existing: Node = {
  id: "n1",
  parent_id: "",
  name: "a.txt",
  is_dir: 0,
  size: 1,
  mime: "text/plain",
  created_at: 1,
  updated_at: 1,
};

function setup() {
  const add = vi.fn();
  const purge = vi.fn(async () => ({ ok: true }));
  const hook = renderHook(() => useBrowserUpload({ dir: "", nodes: [existing], add, purge }));
  return { ...hook, add, purge };
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEYS.uploadConflict);
});

test("同名文件先弹冲突，选择保留两者后自动改名入队", () => {
  const { result, add } = setup();
  act(() => result.current.enqueue([new File(["a"], "a.txt", { type: "text/plain" })]));
  expect(add).not.toHaveBeenCalled();
  expect(result.current.conflicts?.names).toEqual(["a.txt"]);

  act(() => result.current.decide("keepBoth"));
  expect(add).toHaveBeenCalledTimes(1);
  const added = add.mock.calls[0][0] as { file: File }[];
  expect(added[0].file.name).not.toBe("a.txt");
  expect(added[0].file.name.endsWith(".txt")).toBe(true);
});

test("同名文件选择覆盖时先彻底删除旧节点再入队", async () => {
  const { result, add, purge } = setup();
  act(() => result.current.enqueue([new File(["a"], "a.txt", { type: "text/plain" })]));
  act(() => result.current.decide("overwrite"));
  expect(purge).toHaveBeenCalledWith("n1");
  await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
});
