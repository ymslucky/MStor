import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { useLocation } from "react-router-dom";
import type { Node, SearchResult } from "../api/types";
import { renderWithProviders } from "../test/utils";
import { CommandPalette } from "./CommandPalette";

vi.mock("../api/search", () => ({ searchNodes: vi.fn() }));
vi.mock("../api/library", () => ({ listRecent: vi.fn() }));

import { searchNodes } from "../api/search";
import { listRecent } from "../api/library";

const RESULT: SearchResult = {
  nodes: [
    { id: "f1", parent_id: "d1", name: "聚会.jpg", is_dir: 0, size: 1, mime: "image/jpeg", created_at: 1, updated_at: 2 },
    { id: "d9", parent_id: "", name: "聚会资料", is_dir: 1, size: null, mime: null, created_at: 1, updated_at: 2 },
  ],
  paths: { f1: "相册/2026/聚会.jpg", d9: "聚会资料" },
};

// 命中片段用 <mark> 包裹后文本被拆成多个节点，按 textContent 匹配
const contentEq = (text: string) => (_content: string, el: Element | null) => el?.textContent === text;

const RECENT: Node = { id: "r1", parent_id: "d5", name: "旧项目.zip", is_dir: 0, size: 9, mime: null, created_at: 1, updated_at: 2 };

function Probe() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.pathname + loc.search}</span>;
}

function renderWith() {
  const utils = renderWithProviders(
    <>
      <CommandPalette />
      <Probe />
    </>,
  );
  return { ...utils, user: userEvent.setup() };
}

test("⌘K → 分组结果 + 命中高亮 + ↑↓ Enter 跳转", async () => {
  vi.mocked(listRecent).mockResolvedValue({ nodes: [] });
  vi.mocked(searchNodes).mockResolvedValue(RESULT);
  const { user } = renderWith();

  await user.keyboard("{Control>}k{/Control}");
  const input = await screen.findByLabelText("搜索");
  await user.type(input, "聚会");

  // 等防抖后的结果落地，再验证「文件夹 / 文件 / 操作」分组
  await screen.findByText(contentEq("相册/2026/聚会.jpg"));
  expect(screen.getByText("文件夹", { selector: "p" })).toBeInTheDocument();
  expect(screen.getByText("文件", { selector: "p" })).toBeInTheDocument();
  // 命中片段高亮：名称与路径各一处 <mark>
  expect(screen.getAllByText("聚会", { selector: "mark" }).length).toBeGreaterThanOrEqual(2);

  // Tab 切到下一分组（文件夹 → 文件），↑↓ 在两组合并后的列表里移动
  await user.keyboard("{Tab}");
  expect(document.querySelector('[data-active="true"]')?.textContent).toContain("聚会.jpg");
  // 末项不支持 wrap 断言，这里用 ↑ 回到文件夹，再 ↓ 回到文件后 Enter
  await user.keyboard("{ArrowUp}{ArrowDown}{Enter}");
  await waitFor(() => expect(screen.getByTestId("loc")).toHaveTextContent("/?dir=d1"));
});

test("空查询显示最近访问，Esc 关闭命令面板", async () => {
  vi.mocked(listRecent).mockResolvedValue({ nodes: [RECENT] });
  const { user } = renderWith();

  await user.click(screen.getByRole("button", { name: "搜索（⌘K）" }));
  const input = await screen.findByLabelText("搜索");
  await user.click(input);
  expect(await screen.findByText("最近访问")).toBeInTheDocument();
  expect(screen.getByText("旧项目.zip")).toBeInTheDocument();
  // 空查询时静态操作组一并可见（有查询词时按标签过滤）
  expect(screen.getByText("操作", { selector: "p" })).toBeInTheDocument();
  expect(screen.getByText("转到收藏")).toBeInTheDocument();

  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByLabelText("搜索")).not.toBeInTheDocument());
});
