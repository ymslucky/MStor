import type { JSX } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ListFilesResult, Node } from "../api/types";
import { renderWithProviders } from "../test/utils";
import Browser from "./Browser";

// FileList 引用真实的 contentUrl 生成下载链接，mock 时保留其余导出
vi.mock("../api/nodes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/nodes")>()),
  listFiles: vi.fn(),
  createDir: vi.fn(),
  renameNode: vi.fn(),
  moveNode: vi.fn(),
  deleteNode: vi.fn(),
}));

import { createDir, deleteNode, listFiles, moveNode, renameNode } from "../api/nodes";

function fileNode(over: Partial<Node> = {}): Node {
  return {
    id: "f1", parent_id: "", name: "hello.txt", is_dir: 0, size: 12,
    mime: "text/plain", created_at: 1, updated_at: 2, ...over,
  };
}

const ROOT_LIST: ListFilesResult = {
  nodes: [fileNode(), { ...fileNode(), id: "d1", name: "相册", is_dir: 1, size: null, mime: null }],
  breadcrumb: [],
  rootId: "root-1",
};

function renderWith(ui: JSX.Element) {
  const utils = renderWithProviders(ui);
  return { ...utils, user: userEvent.setup() };
}

test("lists files and navigates into folder", async () => {
  vi.mocked(listFiles).mockImplementation(async (parentId: string) =>
    parentId === ""
      ? ROOT_LIST
      : {
          nodes: [],
          breadcrumb: [{ id: "d1", parent_id: "", name: "相册", is_dir: 1, size: null, mime: null, created_at: 1, updated_at: 2 }],
          rootId: "root-1",
        },
  );
  const { user } = renderWith(<Browser />);
  expect(await screen.findByText("📄 hello.txt")).toBeInTheDocument();
  expect(screen.getByText("📁 相册")).toBeInTheDocument();
  await user.click(screen.getByText("📁 相册"));
  await waitFor(() => expect(screen.getByText(/该目录为空/)).toBeInTheDocument());
});

test("create folder calls createDir and refreshes", async () => {
  // 失效后重新拉取的列表要包含新目录，才能断言刷新生效
  vi.mocked(listFiles).mockResolvedValue({
    ...ROOT_LIST,
    nodes: [...ROOT_LIST.nodes, fileNode({ id: "d2", name: "新建", is_dir: 1 })],
  });
  vi.mocked(createDir).mockResolvedValue(fileNode({ id: "d2", name: "新建", is_dir: 1 }));
  const { user } = renderWith(<Browser />);
  await screen.findByText("📄 hello.txt");
  await user.click(screen.getByRole("button", { name: "新建文件夹" }));
  await user.type(screen.getByLabelText("名称"), "新建");
  await user.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(createDir).toHaveBeenCalledWith({ parentId: "", name: "新建" }));
  await waitFor(() => expect(screen.getByText("📁 新建")).toBeInTheDocument());
});

test("rename via dialog calls renameNode", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  vi.mocked(renameNode).mockResolvedValue({ ok: true });
  const { user } = renderWith(<Browser />);
  await screen.findByText("📄 hello.txt");
  await user.click(screen.getByRole("button", { name: /重命名 hello.txt/ }));
  const input = screen.getByLabelText("名称");
  await user.clear(input);
  await user.type(input, "world.txt");
  await user.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(renameNode).toHaveBeenCalledWith("f1", "world.txt"));
});

test("delete asks confirm dialog then calls deleteNode", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  vi.mocked(deleteNode).mockResolvedValue({ ok: true });
  const { user } = renderWith(<Browser />);
  await screen.findByText("📄 hello.txt");
  await user.click(screen.getByRole("button", { name: /删除 hello.txt/ }));
  // 弹窗出现且未确认前不调用删除
  expect(await screen.findByText("确定删除「hello.txt」？可在回收站恢复。")).toBeInTheDocument();
  expect(deleteNode).not.toHaveBeenCalled();
  // 取消仅关弹窗
  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.queryByText("确定删除「hello.txt」？可在回收站恢复。")).not.toBeInTheDocument();
  expect(deleteNode).not.toHaveBeenCalled();
  // 再次打开并在弹窗内确认
  await user.click(screen.getByRole("button", { name: /删除 hello.txt/ }));
  await user.click(await screen.findByRole("button", { name: "删除" }));
  await waitFor(() => expect(deleteNode).toHaveBeenCalledWith("f1"));
});

test("shows skeleton rows while loading", () => {
  vi.mocked(listFiles).mockImplementation(() => new Promise(() => {}));
  const { container } = renderWith(<Browser />);
  const pending = container.querySelector('[aria-busy="true"]');
  expect(pending).not.toBeNull();
  expect(pending!.children).toHaveLength(5);
  expect(pending!.querySelector(".animate-pulse")).not.toBeNull();
});

test("shows error state with retry that refetches", async () => {
  vi.mocked(listFiles).mockClear(); // 清掉前面用例遗留的调用计数
  vi.mocked(listFiles).mockRejectedValue(new Error("boom"));
  const { user } = renderWith(<Browser />);
  expect(await screen.findByText("加载失败")).toBeInTheDocument();
  expect(screen.getByText("请检查网络或刷新页面重试")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() => expect(listFiles).toHaveBeenCalledTimes(2));
});

test("batch: select rows, toggle all, batch delete calls deleteNode per id", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  vi.mocked(deleteNode).mockClear(); // 清掉前面用例遗留的调用计数
  vi.mocked(deleteNode).mockResolvedValue({ ok: true });
  const { user } = renderWith(<Browser />);
  await screen.findByText("📄 hello.txt");
  // 单选一个文件：浮出批量操作条，且 checkbox 点击不触发行打开
  await user.click(screen.getByRole("checkbox", { name: "选择 hello.txt" }));
  expect(screen.getByText("已选 1 项")).toBeInTheDocument();
  expect(screen.getByText("📄 hello.txt")).toBeInTheDocument();
  // 表头全选：当前页全部选中
  await user.click(screen.getByRole("checkbox", { name: "全选" }));
  expect(screen.getByText("已选 2 项")).toBeInTheDocument();
  // 批量删除：弹窗确认后逐个调用 deleteNode
  await user.click(screen.getByRole("button", { name: "删除" }));
  expect(await screen.findByText("确定删除选中的 2 项？可在回收站恢复。")).toBeInTheDocument();
  expect(deleteNode).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "删除" }));
  await waitFor(() => expect(deleteNode).toHaveBeenCalledTimes(2));
  expect(deleteNode).toHaveBeenCalledWith("f1");
  expect(deleteNode).toHaveBeenCalledWith("d1");
});

test("view toggle switches grid container classes and persists preference", async () => {
  localStorage.removeItem("mstor_view");
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  const { user } = renderWith(<Browser />);
  await screen.findByText("📄 hello.txt");
  expect(screen.getByRole("table")).toBeInTheDocument(); // 默认列表视图
  await user.click(screen.getByRole("button", { name: "网格视图" }));
  const grid = screen.getByTestId("file-grid");
  expect(grid).toHaveClass("grid", "grid-cols-2", "sm:grid-cols-3", "lg:grid-cols-4", "xl:grid-cols-6", "gap-3");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(localStorage.getItem("mstor_view")).toBe("grid");
  // 切回列表并持久化偏好
  await user.click(screen.getByRole("button", { name: "列表视图" }));
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(localStorage.getItem("mstor_view")).toBe("list");
});

test("move via dialog calls moveNode with target dir", async () => {
  vi.mocked(listFiles).mockImplementation(async (parentId: string) =>
    parentId === "" ? ROOT_LIST : { nodes: [], breadcrumb: [], rootId: "root-1" },
  );
  vi.mocked(moveNode).mockResolvedValue({ ok: true });
  const { user } = renderWith(<Browser />);
  await screen.findByText("📄 hello.txt");
  await user.click(screen.getByRole("button", { name: /移动 hello.txt/ }));
  await user.click(screen.getByRole("button", { name: "根目录" }));
  await user.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(moveNode).toHaveBeenCalledWith("f1", ""));
});
