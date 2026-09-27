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

test("delete asks confirm then calls deleteNode", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  vi.mocked(deleteNode).mockResolvedValue({ ok: true });
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  const { user } = renderWith(<Browser />);
  await screen.findByText("📄 hello.txt");
  await user.click(screen.getByRole("button", { name: /删除 hello.txt/ }));
  await waitFor(() => expect(deleteNode).toHaveBeenCalledWith("f1"));
  expect(confirmSpy).toHaveBeenCalled();
  vi.restoreAllMocks();
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
