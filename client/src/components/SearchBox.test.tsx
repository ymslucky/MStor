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

import { searchNodes } from "../api/search";

const RESULT: SearchResult = {
  nodes: [
    { id: "f1", parent_id: "d1", name: "聚会.jpg", is_dir: 0, size: 1, mime: "image/jpeg", created_at: 1, updated_at: 2 },
    { id: "d9", parent_id: "", name: "聚会资料", is_dir: 1, size: null, mime: null, created_at: 1, updated_at: 2 },
  ],
  paths: { f1: "相册/2026/聚会.jpg", d9: "聚会资料" },
};

function renderWith(ui: JSX.Element) {
  const utils = renderWithProviders(ui, { route: "/" });
  return { ...utils, user: userEvent.setup() };
}

test("debounces input then shows results with paths", async () => {
  vi.mocked(searchNodes).mockResolvedValue(RESULT);
  const { user } = renderWith(<SearchBox />);
  await user.type(screen.getByLabelText("搜索"), "聚会");
  await waitFor(() => expect(searchNodes).toHaveBeenCalledWith("聚会"), { timeout: 2000 });
  expect(await screen.findByText("相册/2026/聚会.jpg")).toBeInTheDocument();
  expect(screen.getByText("📁 聚会资料")).toBeInTheDocument();
});

test("navigates to parent dir on file click", async () => {
  vi.mocked(searchNodes).mockResolvedValue(RESULT);
  const { user } = renderWith(<SearchBox />);
  await user.type(screen.getByLabelText("搜索"), "聚会");
  await screen.findByText("📄 聚会.jpg");
  await user.click(screen.getByText("📄 聚会.jpg"));
  // 点击后下拉收起（query 被清空）
  await waitFor(() => expect(screen.queryByText("相册/2026/聚会.jpg")).not.toBeInTheDocument());
});

test("does not search for empty/whitespace query", async () => {
  vi.clearAllMocks(); // 前两个用例的调用记录会残留，需先清空
  const { user } = renderWith(<SearchBox />);
  await user.type(screen.getByLabelText("搜索"), "   ");
  await new Promise((r) => setTimeout(r, 500));
  expect(searchNodes).not.toHaveBeenCalled();
});
