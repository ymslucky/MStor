import type { JSX } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { SearchResult } from "../api/types";
import { renderWithProviders } from "../test/utils";
import SearchBox from "./SearchBox";

vi.mock("../api/search", () => ({
  searchNodes: vi.fn(),
}));
vi.mock("../api/library", () => ({
  listRecent: vi.fn(async () => ({ nodes: [] })),
}));

import { searchNodes } from "../api/search";

const RESULT: SearchResult = {
  nodes: [
    { id: "f1", parent_id: "d1", name: "聚会.jpg", is_dir: 0, size: 1, mime: "image/jpeg", created_at: 1, updated_at: 2 },
    { id: "d9", parent_id: "", name: "聚会资料", is_dir: 1, size: null, mime: null, created_at: 1, updated_at: 2 },
  ],
  paths: { f1: "相册/2026/聚会.jpg", d9: "聚会资料" },
};

// 命中片段用 <mark> 包裹后，元素文本被拆成多个文本节点；按 textContent 匹配（断言的行为不变）
const contentEq = (text: string) => (_content: string, el: Element | null) => el?.textContent === text;

function renderWith(ui: JSX.Element) {
  const utils = renderWithProviders(ui, { route: "/" });
  return { ...utils, user: userEvent.setup() };
}

test("debounces input then shows results with paths", async () => {
  vi.mocked(searchNodes).mockResolvedValue(RESULT);
  const { user } = renderWith(<SearchBox />);
  await user.type(screen.getByLabelText("搜索"), "聚会");
  await waitFor(() => expect(searchNodes).toHaveBeenCalledWith({ q: "聚会", sort: "recent", type: "all" }), { timeout: 2000 });
  expect(await screen.findByText(contentEq("相册/2026/聚会.jpg"))).toBeInTheDocument();
  // 图标语义：目录行带 Lucide 类型图标（NodeIcon svg）+ 名称（路径列同名，限定名称 span）
  const dirRow = screen.getByText(contentEq("聚会资料"), { selector: "span" }).closest("button")!;
  expect(dirRow.querySelector("svg")).not.toBeNull();
});

test("navigates to parent dir on file click", async () => {
  vi.mocked(searchNodes).mockResolvedValue(RESULT);
  const { user } = renderWith(<SearchBox />);
  await user.type(screen.getByLabelText("搜索"), "聚会");
  await screen.findByText(contentEq("聚会.jpg"), { selector: "span" });
  await user.click(screen.getByText(contentEq("聚会.jpg"), { selector: "span" }));
  // 点击后下拉收起（query 被清空）
  await waitFor(() => expect(screen.queryByText(contentEq("相册/2026/聚会.jpg"))).not.toBeInTheDocument());
});

test("分页：加载更多用 nextCursor 追加结果", async () => {
  vi.mocked(searchNodes)
    .mockResolvedValueOnce({ ...RESULT, nextCursor: "o:2" })
    .mockResolvedValueOnce({
      nodes: [{ id: "f2", parent_id: "d1", name: "第二页.jpg", is_dir: 0, size: 2, mime: "image/jpeg", created_at: 1, updated_at: 2 }],
      paths: { f2: "相册/第二页.jpg" },
      nextCursor: null,
    });
  const { user } = renderWith(<SearchBox />);
  await user.type(screen.getByLabelText("搜索"), "聚会");
  expect(await screen.findByText(contentEq("聚会.jpg"), { selector: "span" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "加载更多结果" }));
  await waitFor(() =>
    expect(searchNodes).toHaveBeenLastCalledWith({ q: "聚会", sort: "recent", type: "all", cursor: "o:2" }),
  );
  expect(await screen.findByText(contentEq("第二页.jpg"), { selector: "span" })).toBeInTheDocument();
});

test("does not search for empty/whitespace query", async () => {
  vi.clearAllMocks(); // 前两个用例的调用记录会残留，需先清空
  const { user } = renderWith(<SearchBox />);
  await user.type(screen.getByLabelText("搜索"), "   ");
  await new Promise((r) => setTimeout(r, 500));
  expect(searchNodes).not.toHaveBeenCalled();
});
