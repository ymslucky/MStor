import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ListFilesResult } from "../api/types";

vi.mock("../api/nodes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/nodes")>()),
  listFiles: vi.fn(),
}));

import { beforeEach } from "vitest";
import { listFiles } from "../api/nodes";
import MoveDialog, { listDirOptions } from "./MoveDialog";

// 上一用例卸载的对话框可能还有在途扫描：先让出一次宏任务再清空 mock，避免调用记录串场
beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  vi.clearAllMocks();
});

function dir(id: string, name: string) {
  return { id, parent_id: "", name, is_dir: 1 as const, size: null, mime: null, created_at: 1, updated_at: 2 };
}
function list(nodes: ReturnType<typeof dir>[]): ListFilesResult {
  return { nodes, breadcrumb: [], rootId: "root" };
}

test("lists nested dirs and submits the selected target", async () => {
  vi.mocked(listFiles).mockImplementation(async (parentId: string) =>
    parentId === "" ? list([dir("a", "A"), dir("b", "B")]) : parentId === "a" ? list([dir("a1", "A1")]) : list([]),
  );
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<MoveDialog title="移动" onSubmit={onSubmit} onCancel={() => {}} />);
  expect(screen.getByText("正在读取目录…")).toBeInTheDocument();
  // 嵌套目录展示为「父/子」全路径
  expect(await screen.findByText("A/A1")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "B" }));
  expect(screen.getByRole("button", { name: "B" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "确定" }));
  expect(onSubmit).toHaveBeenCalledWith("b");
});

test("root target submits empty id", async () => {
  vi.mocked(listFiles).mockResolvedValue(list([]));
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<MoveDialog title="移动" onSubmit={onSubmit} onCancel={() => {}} />);
  await screen.findByText("暂无其他文件夹");
  await user.click(screen.getByRole("button", { name: "根目录" }));
  await user.click(screen.getByRole("button", { name: "确定" }));
  expect(onSubmit).toHaveBeenCalledWith("");
});

test("excludeId skips the node and its whole subtree", async () => {
  vi.mocked(listFiles).mockImplementation(async (parentId: string) =>
    parentId === "" ? list([dir("x", "移动中的目录"), dir("y", "其他")]) : parentId === "x" ? list([dir("x1", "子树")]) : list([]),
  );
  const dirs = await listDirOptions("x");
  expect(dirs.map((d) => d.id)).toEqual(["y"]);
  expect(listFiles).not.toHaveBeenCalledWith("x");
});

test("同一层超过并发批次（6）也不会漏项，层级按路径相邻排序", async () => {
  const roots = Array.from({ length: 9 }, (_, i) => dir(`r${i}`, `R${i}`));
  vi.mocked(listFiles).mockImplementation(async (parentId: string) => (parentId === "" ? list(roots) : list([])));
  const dirs = await listDirOptions();
  expect(dirs).toHaveLength(9);
  const expected = [...roots.map((r) => r.name)].sort((a, b) => a.localeCompare(b, "zh-CN"));
  expect(dirs.map((d) => d.name)).toEqual(expected);
});

test("父项与子项按路径相邻排序（A, A/A1, B）", async () => {
  vi.mocked(listFiles).mockImplementation(async (parentId: string) =>
    parentId === "" ? list([dir("b", "B"), dir("a", "A")]) : parentId === "a" ? list([dir("a1", "A1")]) : list([]),
  );
  const dirs = await listDirOptions();
  expect(dirs.map((d) => d.name)).toEqual(["A", "A/A1", "B"]);
});

test("cancelled 回调在发起更深层请求前生效", async () => {
  let cancelled = false;
  vi.mocked(listFiles).mockImplementation(async (parentId: string) => {
    if (parentId === "") {
      cancelled = true;
      return list([dir("a", "A")]);
    }
    return list([]);
  });
  const dirs = await listDirOptions(undefined, () => cancelled);
  // 根层结果保留，但不再请求子目录 A
  expect(dirs.map((d) => d.id)).toEqual(["a"]);
  expect(listFiles).not.toHaveBeenCalledWith("a");
});

test("load failure shows retry and recovers", async () => {
  vi.mocked(listFiles)
    .mockRejectedValueOnce(new Error("网络断了"))
    .mockImplementation(async (parentId: string) => (parentId === "" ? list([dir("a", "A")]) : list([])));
  const user = userEvent.setup();
  render(<MoveDialog title="移动" onSubmit={() => {}} onCancel={() => {}} />);
  expect(await screen.findByText("目录加载失败")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByText("A")).toBeInTheDocument();
});

test("dialog close calls onCancel", async () => {
  vi.mocked(listFiles).mockResolvedValue(list([]));
  const user = userEvent.setup();
  const onCancel = vi.fn();
  render(<MoveDialog title="移动" onSubmit={() => {}} onCancel={onCancel} />);
  await screen.findByText("暂无其他文件夹");
  await user.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() => expect(onCancel).toHaveBeenCalled());
});
