import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import AppShell from "./AppShell";

vi.mock("../api/me", () => ({
  getMe: vi.fn(async () => ({ id: "u1", name: "Alice", role: "admin", quotaBytes: 100, usedBytes: 40, trashRetentionDays: 30, self: { id: "u1", name: "Alice", role: "admin" } })),
}));

// clearSessionFlag 由退出确认触发；保留 ApiError/handleSessionExpired 真实现供 QueryCache 使用
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  clearSessionFlag: vi.fn(),
}));

import { clearSessionFlag } from "../api/client";
import { getMe } from "../api/me";

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
});

// 位置探针：断言退出后客户端导航回首页 "/"
function LocationProbe() {
  const { pathname } = useLocation();
  return <span data-testid="loc">{pathname}</span>;
}

function renderShell(initial = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<LocationProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, user: userEvent.setup() };
}

test("shows user name, quota and nav links", async () => {
  renderShell();
  expect(await screen.findByText("Alice")).toBeInTheDocument();
  // 长页面统一在主内容区滚动，StatusBar/上传队列不会盖住最后一行
  expect(document.getElementById("main-content")?.className).toContain("overflow-y-auto");
  // 桌面侧栏导航以 role="navigation" 语义断言；移动端底部 Tab 为另一导航不干扰
  const nav = screen.getByRole("navigation", { name: "主导航" });
  expect(within(nav).getByRole("link", { name: "文件" })).toBeInTheDocument();
  expect(within(nav).getByRole("link", { name: "回收站" })).toBeInTheDocument();
  expect(within(nav).getByRole("link", { name: "分享" })).toBeInTheDocument();
  // 设置已从侧栏导航移到头像行（AccountMenu），仍应可通过无障碍名称定位
  expect(screen.getByRole("link", { name: "设置" })).toBeInTheDocument();
  expect(screen.getAllByText(/40 B/).length).toBeGreaterThanOrEqual(1); // usedBytes（侧栏 StorageMeter）
  // 移动顶栏与桌面档案行各有一个退出按钮，点击均走确认弹窗
  expect(screen.getAllByRole("button", { name: "退出" })).toHaveLength(2);
});

test("mobile drawer opens from top bar and closes on Escape", async () => {
  const { user } = renderShell();
  await screen.findByText("Alice");
  await user.click(screen.getByRole("button", { name: "打开导航" }));
  const drawer = await screen.findByTestId("mobile-drawer");
  expect(within(drawer).getByRole("link", { name: "文件" })).toBeInTheDocument();
  expect(within(drawer).getByRole("button", { name: "关闭导航" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByTestId("mobile-drawer")).not.toBeInTheDocument());
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
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { user } = renderShell("/settings");
  await screen.findByText("Alice");
  await user.click(screen.getAllByRole("button", { name: "退出" })[0]);
  expect(await screen.findByText("退出登录")).toBeInTheDocument();
  expect(screen.getByText("退出后将结束 Cloudflare Access 会话（对所有 Access 应用生效），确定继续吗？")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.queryByText("退出登录")).not.toBeInTheDocument();
  expect(clearSessionFlag).not.toHaveBeenCalled();
  // 取消不发起登出请求，也不导航
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByTestId("loc")).toHaveTextContent("/settings");
});

test("logout confirm clears session and redirects to Access logout", async () => {
  // jsdom 的 location.assign 不可 spyOn，整体替换 location 对象（与 SettingsPage.test 同款）
  const assignMock = vi.fn();
  Object.defineProperty(window, "location", {
    value: { assign: assignMock, href: "https://app.test/settings" },
    configurable: true,
  });
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { user } = renderShell("/settings");
  await screen.findByText("Alice");
  await user.click(screen.getAllByRole("button", { name: "退出" })[1]);
  await screen.findByText("退出登录");
  // 弹窗内确认按钮同为「退出」，需限定在弹窗面板内点击
  await user.click(within(screen.getByTestId("dialog-panel")).getByRole("button", { name: "退出" }));
  expect(clearSessionFlag).toHaveBeenCalledTimes(1);
  // 不再调用本地登出接口：直接跳 Access 全局登出端点
  expect(fetchMock).not.toHaveBeenCalled();
  expect(assignMock).toHaveBeenCalledWith("/cdn-cgi/access/logout");
});

test("pending user sees approval page instead of the app shell", async () => {
  vi.mocked(getMe).mockResolvedValueOnce({
    id: "u-pending", name: "Pending", role: "member", quotaBytes: 0, usedBytes: 0, trashRetentionDays: 30,
    self: { id: "u-pending", name: "Pending", role: "member" }, pending: true,
  });
  renderShell();
  expect(await screen.findByText("账号等待审核")).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "主导航" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "刷新状态" })).toBeInTheDocument();
});

test("sidebar shows the target user's name and avatar while acting as another user", async () => {
  localStorage.setItem("mstor_act_as", "u2");
  // admin 进入 Bob 的空间：/api/me 返回当前空间用户 Bob + 登录账号 self=Alice
  vi.mocked(getMe).mockResolvedValueOnce({
    id: "u2", name: "Bob", role: "member", quotaBytes: 100, usedBytes: 40, trashRetentionDays: 30,
    self: { id: "u1", name: "Alice", role: "admin" },
  });
  renderShell();
  // 档案行显示目标用户 Bob，而非管理员 Alice
  expect(await screen.findByText("Bob")).toBeInTheDocument();
  expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  expect(screen.getByText("管理员代管")).toBeInTheDocument();
  // act-as 横幅显示的是目标空间用户
  expect(screen.getByText(/查看「Bob」的空间/)).toBeInTheDocument();
  localStorage.removeItem("mstor_act_as");
});
