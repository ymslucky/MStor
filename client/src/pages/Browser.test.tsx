import type { JSX } from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ListFilesResult, Node } from "../api/types";
import { renderWithProviders } from "../test/utils";
import { Toaster } from "../components/Toaster";
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

// 上传队列 mock：拖拽/文件选择断言 queue.add 调用（不入真实上传流程）
const { queueAdd } = vi.hoisted(() => ({ queueAdd: vi.fn() }));
vi.mock("../hooks/useUploadQueue", () => ({
  useUploadQueue: () => ({ items: [], add: queueAdd, retry: vi.fn(), clearFinished: vi.fn() }),
}));

vi.mock("../api/shares", () => ({
  listShares: vi.fn().mockResolvedValue({ shares: [] }),
}));

import { createDir, deleteNode, listFiles, moveNode, renameNode } from "../api/nodes";
import { listShares } from "../api/shares";

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

// 模拟 dir=层级1（目录内为空）
const SUB_DIR_LIST: ListFilesResult = {
  nodes: [],
  breadcrumb: [{ id: "d1", parent_id: "", name: "相册", is_dir: 1, size: null, mime: null, created_at: 1, updated_at: 2 }],
  rootId: "root-1",
};

function renderWith(ui: JSX.Element, opts?: { route?: string }) {
  const utils = renderWithProviders(ui, opts);
  return { ...utils, user: userEvent.setup() };
}

// 节点拖拽 dataTransfer mock：setData 写入 payload，drop 读回
function makeNodeDT() {
  const store = new Map<string, string>();
  const dt = {
    types: [] as string[],
    effectAllowed: "all",
    setData(type: string, value: string) {
      store.set(type, value);
      if (!dt.types.includes(type)) dt.types.push(type);
    },
    getData(type: string) {
      return store.get(type) ?? "";
    },
  };
  return dt;
}

test("lists files and navigates into folder", async () => {
  vi.mocked(listFiles).mockImplementation(async (parentId: string) => (parentId === "" ? ROOT_LIST : SUB_DIR_LIST));
  const { user } = renderWith(<Browser />);
  expect(await screen.findByText("hello.txt")).toBeInTheDocument();
  expect(screen.getByText("相册")).toBeInTheDocument();
  await user.click(screen.getByText("相册"));
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
  await screen.findByText("hello.txt");
  // 工具栏与空状态各有一个同名按钮，取工具栏那个
  await user.click(screen.getAllByRole("button", { name: "新建文件夹" })[0]);
  await user.type(screen.getByLabelText("名称"), "新建");
  await user.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(createDir).toHaveBeenCalledWith({ parentId: "", name: "新建" }));
  await waitFor(() => expect(screen.getByText("新建")).toBeInTheDocument());
});

test("rename via dialog calls renameNode", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  vi.mocked(renameNode).mockResolvedValue({ ok: true });
  const { user } = renderWith(<Browser />);
  await screen.findByText("hello.txt");
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
  await screen.findByText("hello.txt");
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
  await screen.findByText("hello.txt");
  // 单选一个文件：浮出批量操作条，且 checkbox 点击不触发行打开
  await user.click(screen.getByRole("checkbox", { name: "选择 hello.txt" }));
  expect(screen.getByText("已选 1 项")).toBeInTheDocument();
  expect(screen.getByText("hello.txt")).toBeInTheDocument();
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

test("selection hook: ctrl-click toggles and shift-click selects range", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  renderWithProviders(<Browser />);
  await screen.findByText("hello.txt");
  // Ctrl 点选第一行（锚点）
  fireEvent.click(screen.getByText("hello.txt"), { ctrlKey: true });
  expect(screen.getByText("已选 1 项")).toBeInTheDocument();
  // Shift 点目录行 → 范围选两行
  fireEvent.click(screen.getByText("相册"), { shiftKey: true });
  expect(screen.getByText("已选 2 项")).toBeInTheDocument();
});

test("keyboard: Ctrl+A selects all rows", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  renderWithProviders(<Browser />);
  await screen.findByText("hello.txt");
  fireEvent.keyDown(screen.getByTestId("file-list-container"), { key: "a", ctrlKey: true });
  expect(screen.getByText("已选 2 项")).toBeInTheDocument();
});

test("keyboard: arrows move focus ring, Enter opens focused row", async () => {
  vi.mocked(listFiles).mockImplementation(async (parentId: string) => (parentId === "" ? ROOT_LIST : SUB_DIR_LIST));
  const { user } = renderWith(<Browser />);
  await screen.findByText("hello.txt");
  const container = screen.getByTestId("file-list-container");
  fireEvent.keyDown(container, { key: "ArrowDown" });
  expect(screen.getByText("hello.txt").closest("tr")).toHaveClass("ring-2", "ring-primary");
  // Enter 打开文件 → 预览弹层（含关闭按钮）
  fireEvent.keyDown(container, { key: "Enter" });
  expect(await screen.findByRole("button", { name: "关闭" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "关闭" }));
  // ↓↓ 到目录行，Enter 进入目录
  fireEvent.keyDown(container, { key: "ArrowDown" });
  fireEvent.keyDown(container, { key: "ArrowDown" });
  fireEvent.keyDown(container, { key: "Enter" });
  await waitFor(() => expect(screen.getByText(/该目录为空/)).toBeInTheDocument());
});

test("keyboard: F2 renames and Delete asks confirm on focused row", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  vi.mocked(renameNode).mockResolvedValue({ ok: true });
  vi.mocked(deleteNode).mockResolvedValue({ ok: true });
  const { user } = renderWith(<Browser />);
  await screen.findByText("hello.txt");
  const container = screen.getByTestId("file-list-container");
  fireEvent.keyDown(container, { key: "ArrowDown" });
  // F2 → 既有重命名对话框
  fireEvent.keyDown(container, { key: "F2" });
  const input = await screen.findByLabelText("名称");
  await user.clear(input);
  await user.type(input, "world.txt");
  await user.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(renameNode).toHaveBeenCalledWith("f1", "world.txt"));
  // Delete → 删除确认对话框
  fireEvent.keyDown(container, { key: "Delete" });
  expect(await screen.findByText("确定删除「hello.txt」？可在回收站恢复。")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "取消" }));
});

test("keyboard: Space previews focused file", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  renderWithProviders(<Browser />);
  await screen.findByText("hello.txt");
  const container = screen.getByTestId("file-list-container");
  fireEvent.keyDown(container, { key: "ArrowDown" });
  fireEvent.keyDown(container, { key: " " });
  expect(await screen.findByRole("button", { name: "关闭" })).toBeInTheDocument();
});

test("view toggle switches grid container classes and persists preference", async () => {
  localStorage.removeItem("mstor_view");
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  const { user } = renderWith(<Browser />);
  await screen.findByText("hello.txt");
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
  await screen.findByText("hello.txt");
  await user.click(screen.getByRole("button", { name: /移动 hello.txt/ }));
  await user.click(screen.getByRole("button", { name: "根目录" }));
  await user.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(moveNode).toHaveBeenCalledWith("f1", ""));
});

test("drag-drop onto drop zone shows overlay and queues files into current dir", async () => {
  queueAdd.mockClear();
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  renderWithProviders(<Browser />);
  await screen.findByText("hello.txt");
  const zone = screen.getByTestId("drop-zone");
  // dragenter 显示全屏覆盖层
  fireEvent.dragEnter(zone);
  expect(screen.getByTestId("drop-overlay")).toBeInTheDocument();
  expect(screen.getByText("松开，上传到当前目录")).toBeInTheDocument();
  // drop → queue.add(files, dir)
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(["a"], "a.txt", { type: "text/plain" }), new File(["b"], "b.png", { type: "image/png" })] },
  });
  expect(queueAdd).toHaveBeenCalledTimes(1);
  const [files, parentId] = queueAdd.mock.calls[0];
  expect(files.map((f: File) => f.name)).toEqual(["a.txt", "b.png"]);
  expect(parentId).toBe("");
  // drop 后覆盖层关闭
  expect(screen.queryByTestId("drop-overlay")).not.toBeInTheDocument();
});

test("drag overlay survives partial dragleave (counter) until leaving window", async () => {
  queueAdd.mockClear();
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  renderWithProviders(<Browser />);
  await screen.findByText("hello.txt");
  const zone = screen.getByTestId("drop-zone");
  fireEvent.dragEnter(zone);
  fireEvent.dragEnter(zone);
  fireEvent.dragLeave(zone);
  // 计数法：还有一次 enter 未配对，覆盖层保持
  expect(screen.getByTestId("drop-overlay")).toBeInTheDocument();
  fireEvent.dragLeave(zone);
  expect(screen.queryByTestId("drop-overlay")).not.toBeInTheDocument();
});

test("dropping a directory entry is ignored with toast", async () => {
  queueAdd.mockClear();
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  renderWithProviders(
    <>
      <Browser />
      <Toaster />
    </>,
  );
  await screen.findByText("hello.txt");
  fireEvent.drop(screen.getByTestId("drop-zone"), {
    dataTransfer: { files: [], items: [{ webkitGetAsEntry: () => ({ isDirectory: true }) }] },
  });
  expect(queueAdd).not.toHaveBeenCalled();
  expect(await screen.findByText("文件夹暂不支持，请压缩后上传")).toBeInTheDocument();
});

test("drag file row onto folder row highlights it and calls moveNode", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  vi.mocked(moveNode).mockResolvedValue({ ok: true });
  renderWithProviders(<Browser />);
  await screen.findByText("hello.txt");
  const dt = makeNodeDT();
  fireEvent.dragStart(screen.getByText("hello.txt").closest("tr")!, { dataTransfer: dt });
  fireEvent.dragOver(screen.getByText("相册").closest("tr")!, { dataTransfer: dt });
  // dragover 高亮：2px 主色
  expect(screen.getByText("相册").closest("tr")!).toHaveClass("ring-2", "ring-primary");
  fireEvent.drop(screen.getByText("相册").closest("tr")!, { dataTransfer: dt });
  await waitFor(() => expect(moveNode).toHaveBeenCalledWith("f1", "d1"));
});

test("dragging a folder onto the root breadcrumb moves it to root", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  vi.mocked(moveNode).mockResolvedValue({ ok: true });
  renderWithProviders(<Browser />);
  await screen.findByText("hello.txt");
  const dt = makeNodeDT();
  fireEvent.dragStart(screen.getByText("相册").closest("tr")!, { dataTransfer: dt });
  fireEvent.drop(screen.getByRole("link", { name: "全部文件" }), { dataTransfer: dt });
  await waitFor(() => expect(moveNode).toHaveBeenCalledWith("d1", ""));
});

test("drag disables selection until dragend", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  renderWithProviders(<Browser />);
  await screen.findByText("hello.txt");
  const dt = makeNodeDT();
  const row = screen.getByText("hello.txt").closest("tr")!;
  fireEvent.dragStart(row, { dataTransfer: dt });
  expect(screen.getByRole("checkbox", { name: "选择 hello.txt" })).toBeDisabled();
  fireEvent.dragEnd(row, { dataTransfer: dt });
  expect(screen.getByRole("checkbox", { name: "选择 hello.txt" })).toBeEnabled();
});

test("list view virtualizes when rows >= 50", async () => {
  vi.mocked(listFiles).mockResolvedValue({
    nodes: Array.from({ length: 60 }, (_, i) => fileNode({ id: `f${i}`, name: `file-${i}.txt` })),
    breadcrumb: [],
    rootId: "root-1",
  });
  const { container } = renderWithProviders(<Browser />);
  await screen.findByText("file-0.txt");
  expect(screen.getByTestId("file-virtual")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  // 窗口化：仅渲染可视区行，而非全部 60 行
  const rendered = container.querySelectorAll("[data-file-row]").length;
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(60);
});

test("filter chips narrow the current list purely client-side and restore on clear", async () => {
  vi.mocked(listFiles).mockResolvedValue({
    nodes: [
      fileNode({ id: "img", name: "photo.png", mime: "image/png", updated_at: Date.now() }),
      fileNode({ id: "vid", name: "clip.mp4", mime: "video/mp4", updated_at: Date.now() }),
      fileNode({ id: "doc", name: "readme.md", mime: "text/markdown", updated_at: Date.now() - 40 * 864e5 }),
      { ...fileNode(), id: "d9", name: "相册", is_dir: 1, size: null, mime: null },
    ],
    breadcrumb: [],
    rootId: "root-1",
  });
  const { user } = renderWith(<Browser />);
  await screen.findByText("photo.png");
  // 类型=图片：只剩图片文件（文件夹也隐藏）
  await user.click(screen.getByRole("button", { name: "图片" }));
  expect(screen.queryByText("clip.mp4")).not.toBeInTheDocument();
  expect(screen.queryByText("相册")).not.toBeInTheDocument();
  expect(screen.getByText("photo.png")).toBeInTheDocument();
  // 叠加时间=今天：photo 仍在
  await user.click(screen.getByRole("button", { name: "今天" }));
  expect(screen.getByText("photo.png")).toBeInTheDocument();
  // 清空：时间 chip 再点一次取消，类型点「全部」
  await user.click(screen.getByRole("button", { name: "今天" }));
  await user.click(screen.getByRole("button", { name: "全部" }));
  expect(screen.getByText("clip.mp4")).toBeInTheDocument();
  expect(screen.getByText("readme.md")).toBeInTheDocument();
  expect(screen.getByText("相册")).toBeInTheDocument();
});

test("shared nodes show a shared badge", async () => {
  vi.mocked(listShares).mockResolvedValue({
    shares: [
      { id: "s1", node_id: "f1", token: "t", expires_at: null, downloads: 0, created_at: 1, node_name: "hello.txt", node_is_dir: 0, node_size: 12 },
    ],
  });
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  renderWithProviders(<Browser />);
  await screen.findByText("hello.txt");
  expect(screen.getByText("已分享")).toBeInTheDocument();
});

test("context menu: opens at pointer on row, dispatches rename action", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  vi.mocked(renameNode).mockResolvedValue({ ok: true });
  const { user } = renderWith(<Browser />);
  await screen.findByText("hello.txt");
  await user.pointer({ keys: "[MouseRight]", target: screen.getByText("hello.txt") });
  expect(screen.getByRole("menu")).toBeInTheDocument();
  // 文件菜单含下载项
  expect(screen.getByRole("menuitem", { name: "下载" })).toBeInTheDocument();
  // 动作分发：重命名复用既有对话框
  await user.click(screen.getByRole("menuitem", { name: "重命名" }));
  expect(await screen.findByLabelText("名称")).toBeInTheDocument();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("context menu: folder has no download item", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  const { user } = renderWith(<Browser />);
  await screen.findByText("相册");
  await user.pointer({ keys: "[MouseRight]", target: screen.getByText("相册") });
  expect(screen.getByRole("menu")).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "下载" })).not.toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "打开" })).toBeInTheDocument();
});

test("context menu: copy link copies content URL and details opens read-only dialog", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  const writeText = vi.fn().mockResolvedValue(undefined);
  // userEvent.setup() 会装上它自己的剪贴板 stub，因此需在其后再覆盖 navigator.clipboard
  const { user } = renderWith(<Browser />);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  await screen.findByText("hello.txt");
  await user.pointer({ keys: "[MouseRight]", target: screen.getByText("hello.txt") });
  // 复制链接：content URL 写入剪贴板
  await user.click(screen.getByRole("menuitem", { name: "复制链接" }));
  expect(writeText).toHaveBeenCalledWith("http://localhost:3000/api/files/f1/content");
  // 详情：只读属性弹窗
  await user.pointer({ keys: "[MouseRight]", target: screen.getByText("hello.txt") });
  await user.click(screen.getByRole("menuitem", { name: "详情" }));
  expect(await screen.findByRole("heading", { name: "详情" })).toBeInTheDocument();
  // 弹窗内断言属性（行内也有同名文本）
  const panel = within(screen.getByTestId("dialog-panel"));
  expect(panel.getByText("text/plain")).toBeInTheDocument();
  expect(panel.getByText("12 B")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByTestId("dialog-panel")).not.toBeInTheDocument();
});

test("context menu: closes on Escape and outside click", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  const { user } = renderWith(<Browser />);
  await screen.findByText("hello.txt");
  await user.pointer({ keys: "[MouseRight]", target: screen.getByText("hello.txt") });
  expect(screen.getByRole("menu")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  // 点击他处关闭
  await user.pointer({ keys: "[MouseRight]", target: screen.getByText("hello.txt") });
  expect(screen.getByRole("menu")).toBeInTheDocument();
  await user.click(document.body);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("breadcrumb uses chevron separator with root label and highlights current level", async () => {
  vi.mocked(listFiles).mockImplementation(async (parentId: string) =>
    parentId === ""
      ? ROOT_LIST
      : {
          nodes: [],
          breadcrumb: [{ id: "c1", parent_id: "", name: "层级1", is_dir: 1, size: null, mime: null, created_at: 1, updated_at: 1 }],
          rootId: "root-1",
        },
  );
  const { user } = renderWith(<Browser />);
  await screen.findByText("hello.txt");
  await user.click(screen.getByText("相册"));
  await screen.findByText("层级1");
  const nav = screen.getByRole("navigation", { name: "面包屑" });
  expect(nav).toHaveTextContent("全部文件");
  expect(nav).toHaveTextContent("›");
  const current = screen.getByRole("link", { name: "层级1" });
  expect(current).toHaveClass("font-medium", "text-ink");
  expect(current).toHaveAttribute("aria-current", "page");
});

test("breadcrumb collapses middle levels into popover when deeper than 4 levels", async () => {
  const crumb = (i: number): Node => ({
    id: `c${i}`, parent_id: i === 1 ? "" : `c${i - 1}`, name: `层级${i}`,
    is_dir: 1, size: null, mime: null, created_at: 1, updated_at: 1,
  });
  vi.mocked(listFiles).mockImplementation(async (parentId: string) =>
    parentId === "" ? ROOT_LIST : { nodes: [], breadcrumb: [1, 2, 3, 4].map(crumb), rootId: "root-1" },
  );
  const { user } = renderWith(<Browser />, { route: "/?dir=c4" });
  await screen.findByText("层级4");
  // 根 + 4 级：中间折叠为「…」按钮，父级与当前级平铺
  expect(screen.getByRole("link", { name: "层级3" })).toBeInTheDocument();
  const more = screen.getByRole("button", { name: "更多层级" });
  await user.click(more);
  // 弹出被折叠层级列表，保持 Link 语义
  expect(screen.getByRole("link", { name: "层级1" })).toHaveAttribute("href", "/?dir=c1");
  expect(screen.getByRole("link", { name: "层级2" })).toHaveAttribute("href", "/?dir=c2");
  // Esc 关闭
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("link", { name: "层级1" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "层级4" })).toBeInTheDocument();
});

test("empty dir offers upload and create-folder CTAs", async () => {
  vi.mocked(listFiles).mockResolvedValue({ nodes: [], breadcrumb: [], rootId: "root-1" });
  const { user } = renderWith(<Browser />);
  await screen.findByText("该目录为空");
  expect(screen.getByRole("button", { name: "上传文件" })).toBeInTheDocument();
  // 空状态「新建文件夹」CTA 打开既有新建对话框（工具栏还有一个同名按钮）
  const ctas = screen.getAllByRole("button", { name: "新建文件夹" });
  expect(ctas.length).toBeGreaterThanOrEqual(2);
  await user.click(ctas[1]);
  expect(await screen.findByLabelText("名称")).toBeInTheDocument();
});
