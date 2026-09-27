import type { JSX } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Node } from "../api/types";
import { renderWithProviders } from "../test/utils";
import TrashPage from "./TrashPage";

vi.mock("../api/trash", () => ({
  listTrash: vi.fn(),
  restoreNode: vi.fn(),
  purgeNode: vi.fn(),
}));

import { listTrash, purgeNode, restoreNode } from "../api/trash";

function node(over: Partial<Node> = {}): Node {
  return {
    id: "t1", parent_id: "", name: "旧文件.txt", is_dir: 0, size: 5, mime: "text/plain",
    created_at: 1, updated_at: 2, deleted_at: 1700000000000, ...over,
  };
}

function renderWith(ui: JSX.Element) {
  const utils = renderWithProviders(ui);
  return { ...utils, user: userEvent.setup() };
}

test("lists trashed nodes with deleted date", async () => {
  vi.mocked(listTrash).mockResolvedValue({ nodes: [node()] });
  renderWith(<TrashPage />);
  expect(await screen.findByText(/旧文件\.txt/)).toBeInTheDocument();
  expect(screen.getByText(/2023/)).toBeInTheDocument(); // deleted_at 年份
});

test("restore calls restoreNode and refreshes", async () => {
  // 首次返回一条，失效重拉后返回空，才能断言「回收站为空」
  vi.mocked(listTrash).mockResolvedValueOnce({ nodes: [node()] }).mockResolvedValue({ nodes: [] });
  vi.mocked(restoreNode).mockResolvedValue({ ok: true });
  const { user } = renderWith(<TrashPage />);
  await screen.findByText(/旧文件\.txt/);
  await user.click(screen.getByRole("button", { name: "恢复" }));
  await waitFor(() => expect(restoreNode).toHaveBeenCalledWith("t1"));
  await waitFor(() => expect(screen.getByText(/回收站为空/)).toBeInTheDocument());
});

test("purge requires confirm dialog", async () => {
  vi.mocked(listTrash).mockResolvedValue({ nodes: [node()] });
  vi.mocked(purgeNode).mockResolvedValue({ ok: true });
  const { user } = renderWith(<TrashPage />);
  await screen.findByText(/旧文件\.txt/);
  await user.click(screen.getByRole("button", { name: "彻底删除" }));
  expect(await screen.findByText(/彻底删除「旧文件\.txt」？此操作不可恢复。/)).toBeInTheDocument();
  expect(purgeNode).not.toHaveBeenCalled();
  // 取消仅关弹窗
  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(purgeNode).not.toHaveBeenCalled();
  // 再次打开并在弹窗内确认（弹窗内确认按钮与行内 IconButton 同名，限定面板内点击）
  await user.click(screen.getByRole("button", { name: "彻底删除" }));
  await user.click(within(await screen.findByTestId("dialog-panel")).getByRole("button", { name: "彻底删除" }));
  await waitFor(() => expect(purgeNode).toHaveBeenCalledWith("t1"));
});

test("restore and purge also invalidate me for quota refresh", async () => {
  vi.mocked(listTrash).mockResolvedValue({ nodes: [node()] });
  vi.mocked(restoreNode).mockResolvedValue({ ok: true });
  vi.mocked(purgeNode).mockResolvedValue({ ok: true });
  const { user, qc } = renderWith(<TrashPage />);
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  const meCalls = () =>
    invalidateSpy.mock.calls.filter(
      ([filters]) => ((filters as { queryKey?: unknown[] } | undefined)?.queryKey?.[0]) === "me",
    );
  await screen.findByText(/旧文件\.txt/);
  await user.click(screen.getByRole("button", { name: "恢复" }));
  await waitFor(() => expect(meCalls()).toHaveLength(1)); // 恢复占用配额，需刷新
  await user.click(screen.getByRole("button", { name: "彻底删除" }));
  await user.click(within(await screen.findByTestId("dialog-panel")).getByRole("button", { name: "彻底删除" }));
  await waitFor(() => expect(meCalls()).toHaveLength(2)); // 彻底删除释放配额，需刷新
});
