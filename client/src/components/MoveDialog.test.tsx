import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("../api/nodes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/nodes")>()),
  listDirTree: vi.fn(),
}));

import { listDirTree } from "../api/nodes";
import type { DirTreeRow } from "../api/nodes";
import MoveDialog, { listDirOptions } from "./MoveDialog";

function row(id: string, name: string, parent = "root"): DirTreeRow {
  return { id, parent_id: parent, name, path: "/root/" };
}

// 上一用例卸载的对话框可能还有在途读取：先让出一次宏任务再清空 mock
beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  vi.clearAllMocks();
});

test("列出嵌套目录并提交所选目标", async () => {
  vi.mocked(listDirTree).mockResolvedValue({
    dirs: [row("a", "A"), row("b", "B"), row("a1", "A1", "a")],
    truncated: false,
  });
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

test("根目录提交空 id", async () => {
  vi.mocked(listDirTree).mockResolvedValue({ dirs: [], truncated: false });
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<MoveDialog title="移动" onSubmit={onSubmit} onCancel={() => {}} />);
  await screen.findByText("暂无其他文件夹");
  await user.click(screen.getByRole("button", { name: "根目录" }));
  await user.click(screen.getByRole("button", { name: "确定" }));
  expect(onSubmit).toHaveBeenCalledWith("");
});

test("excludeId 跳过节点及整棵子树（且只请求一次）", async () => {
  vi.mocked(listDirTree).mockResolvedValue({
    dirs: [row("x", "移动中的目录"), row("x1", "子树", "x"), row("y", "其他")],
    truncated: false,
  });
  const { options, truncated } = await listDirOptions("x");
  expect(options.map((d) => d.id)).toEqual(["y"]);
  expect(truncated).toBe(false);
  expect(listDirTree).toHaveBeenCalledTimes(1);
});

test("truncated 时提示目录过多", async () => {
  vi.mocked(listDirTree).mockResolvedValue({ dirs: [row("a", "A")], truncated: true });
  render(<MoveDialog title="移动" onSubmit={() => {}} onCancel={() => {}} />);
  expect(await screen.findByText(/仅显示前 5000 个/)).toBeInTheDocument();
});

test("加载失败显示重试并恢复", async () => {
  vi.mocked(listDirTree)
    .mockRejectedValueOnce(new Error("网络断了"))
    .mockResolvedValue({ dirs: [row("a", "A")], truncated: false });
  const user = userEvent.setup();
  render(<MoveDialog title="移动" onSubmit={() => {}} onCancel={() => {}} />);
  expect(await screen.findByText("目录加载失败")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByText("A")).toBeInTheDocument();
});

test("关闭对话框调用 onCancel", async () => {
  vi.mocked(listDirTree).mockResolvedValue({ dirs: [], truncated: false });
  const user = userEvent.setup();
  const onCancel = vi.fn();
  render(<MoveDialog title="移动" onSubmit={() => {}} onCancel={onCancel} />);
  await screen.findByText("暂无其他文件夹");
  await user.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() => expect(onCancel).toHaveBeenCalled());
});

test("取消回调生效后不再返回扫描结果", async () => {
  vi.mocked(listDirTree).mockResolvedValue({ dirs: [row("a", "A")], truncated: false });
  const { options } = await listDirOptions(undefined, () => true);
  expect(options).toEqual([]);
});
