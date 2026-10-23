import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../api/library", () => ({
  listTags: vi.fn(),
  listTagged: vi.fn(),
  listFavorites: vi.fn(),
  listRecent: vi.fn(),
  removeFavorite: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

import { createTag, deleteTag, listFavorites, listTagged, listTags, removeFavorite, updateTag } from "../api/library";
import LibraryPage from "./LibraryPage";

function renderPage(kind: "tags" | "favorites" = "tags") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[kind === "favorites" ? "/favorites" : "/tags"]}>
        <LibraryPage kind={kind} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, user: userEvent.setup() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listTags).mockResolvedValue({ tags: [{ id: "t1", name: "家庭", nodes: 2 }] });
  vi.mocked(listTagged).mockResolvedValue({ nodes: [] });
  vi.mocked(listFavorites).mockResolvedValue({
    nodes: [{
      id: "f1", parent_id: "p1", name: "report.pdf", is_dir: 0, size: 10, mime: "application/pdf",
      created_at: 1, updated_at: 1,
    }],
  });
  vi.mocked(removeFavorite).mockResolvedValue({ ok: true });
  vi.mocked(createTag).mockResolvedValue({ id: "t2", name: "旅行" });
  vi.mocked(updateTag).mockResolvedValue({ id: "t1", name: "家庭", color: "#0f766e" });
  vi.mocked(deleteTag).mockResolvedValue({ ok: true });
});

test("收藏文件跳到父目录并定位，可直接取消收藏", async () => {
  const { user } = renderPage("favorites");
  const link = await screen.findByRole("link", { name: /report.pdf/ });
  expect(link).toHaveAttribute("href", "/?dir=p1&focus=f1");
  await user.click(screen.getByRole("button", { name: "取消收藏 report.pdf" }));
  await waitFor(() => expect(removeFavorite).toHaveBeenCalledWith("f1"));
});

test("标签页可新建标签", async () => {
  const { user } = renderPage();
  await screen.findByText("家庭");
  await user.type(screen.getByLabelText("新标签名"), "旅行");
  await user.selectOptions(screen.getByLabelText("标签颜色"), "#be123c");
  await user.click(screen.getByRole("button", { name: "新建标签" }));
  await waitFor(() => expect(createTag).toHaveBeenCalledWith("旅行", "#be123c"));
});

test("选中标签后可重命名", async () => {
  const { user } = renderPage();
  await screen.findByText("家庭");
  await user.click(screen.getByRole("button", { name: "家庭" }));
  await waitFor(() => expect(listTagged).toHaveBeenCalledWith("t1"));
  await user.click(screen.getByRole("button", { name: "重命名" }));
  const input = screen.getByLabelText("标签名称");
  await user.clear(input);
  await user.type(input, "家用");
  await user.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(updateTag).toHaveBeenCalledWith("t1", { name: "家用" }));
});

test("选中标签后可修改颜色", async () => {
  const { user } = renderPage();
  await screen.findByText("家庭");
  await user.click(screen.getByRole("button", { name: "家庭" }));
  await waitFor(() => expect(listTagged).toHaveBeenCalledWith("t1"));
  await user.selectOptions(screen.getByLabelText("修改标签颜色"), "#0f766e");
  await waitFor(() => expect(updateTag).toHaveBeenCalledWith("t1", { color: "#0f766e" }));
});

test("选中标签后可删除该标签（二次确认）", async () => {
  const { user } = renderPage();
  await screen.findByText("家庭");
  await user.click(screen.getByRole("button", { name: "家庭" }));
  await waitFor(() => expect(listTagged).toHaveBeenCalledWith("t1"));
  // 选中标签后仍保留标签 pills，可直接切换（不再消失）
  expect(screen.getByRole("button", { name: "全部标签" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "家庭" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "删除该标签" }));
  await user.click(within(await screen.findByTestId("dialog-panel")).getByRole("button", { name: "删除" }));
  await waitFor(() => expect(deleteTag).toHaveBeenCalledWith("t1"));
});
