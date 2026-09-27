import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import AppShell from "./AppShell";

vi.mock("../api/me", () => ({
  getMe: async () => ({ id: "u1", name: "Alice", role: "admin", quotaBytes: 100, usedBytes: 40 }),
}));

// clearSessionFlag 由退出确认触发；保留 ApiError/handleSessionExpired 真实现供 QueryCache 使用
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  clearSessionFlag: vi.fn(),
}));

import { clearSessionFlag } from "../api/client";

beforeAll(() => {
  // 退出确认后 window.location.href 跳转，jsdom 无真实导航，替换为可断言对象
  Object.defineProperty(window, "location", { value: { href: "" }, configurable: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  window.location.href = "";
  localStorage.clear();
});

function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, user: userEvent.setup() };
}

test("shows user name, quota and nav links", async () => {
  renderShell();
  expect(await screen.findByText("Alice")).toBeInTheDocument();
  // 桌面侧栏导航以 role="navigation" 语义断言；移动端底部 Tab 为另一导航不干扰
  const nav = screen.getByRole("navigation", { name: "主导航" });
  expect(within(nav).getByRole("link", { name: "文件" })).toBeInTheDocument();
  expect(within(nav).getByRole("link", { name: "回收站" })).toBeInTheDocument();
  expect(within(nav).getByRole("link", { name: "分享" })).toBeInTheDocument();
  expect(within(nav).getByRole("link", { name: "设置" })).toBeInTheDocument();
  expect(screen.getByText(/40 B/)).toBeInTheDocument(); // usedBytes（侧栏 StorageMeter）
  // 移动顶栏与桌面档案行各有一个退出按钮，点击均走确认弹窗
  expect(screen.getAllByRole("button", { name: "退出" })).toHaveLength(2);
});

test("sidebar toggle collapses, expands and persists to localStorage", async () => {
  const { user } = renderShell();
  await screen.findByText("Alice");
  expect(localStorage.getItem("mstor_sidebar")).toBeNull();
  await user.click(screen.getByRole("button", { name: "折叠侧栏" }));
  expect(screen.getByRole("button", { name: "展开侧栏" })).toBeInTheDocument();
  expect(localStorage.getItem("mstor_sidebar")).toBe("collapsed");
  await user.click(screen.getByRole("button", { name: "展开侧栏" }));
  expect(screen.getByRole("button", { name: "折叠侧栏" })).toBeInTheDocument();
  expect(localStorage.getItem("mstor_sidebar")).toBe("expanded");
});

test("logout opens confirm dialog; cancel keeps session", async () => {
  const { user } = renderShell();
  await screen.findByText("Alice");
  await user.click(screen.getAllByRole("button", { name: "退出" })[0]);
  expect(await screen.findByText("退出登录")).toBeInTheDocument();
  expect(screen.getByText("确定要退出当前账号吗？")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.queryByText("退出登录")).not.toBeInTheDocument();
  expect(clearSessionFlag).not.toHaveBeenCalled();
  expect(window.location.href).toBe("");
});

test("logout confirm clears session flag and redirects", async () => {
  const { user } = renderShell();
  await screen.findByText("Alice");
  await user.click(screen.getAllByRole("button", { name: "退出" })[1]);
  await screen.findByText("退出登录");
  // 弹窗内确认按钮同为「退出」，需限定在弹窗面板内点击
  await user.click(within(screen.getByTestId("dialog-panel")).getByRole("button", { name: "退出" }));
  expect(clearSessionFlag).toHaveBeenCalledTimes(1);
  expect(window.location.href).toBe("/auth/logout");
});
