import type { JSX } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { AdminUser, Me } from "../api/types";
import { renderWithProviders } from "../test/utils";
import PlatformPage from "./PlatformPage";

vi.mock("../api/me", () => ({
  listAdminUsers: vi.fn(),
  patchAdminUser: vi.fn(),
  startActAs: vi.fn(),
  getAdminOverview: vi.fn(),
}));

import { listAdminUsers, patchAdminUser, startActAs } from "../api/me";

// PlatformPage 支持注入 me：直接渲染（不经 Outlet）也能测
const ME: Me = { id: "u-admin", name: "Alice", role: "admin", quotaBytes: 100, usedBytes: 10, trashRetentionDays: 30, self: { id: "u-admin", name: "Alice", role: "admin" } };

function mkUser(over: Partial<AdminUser> = {}): AdminUser {
  return { id: "u1", name: "Bob", platform_admin: 0, quota_bytes: 10737418240, created_at: 1, disabled_at: null, approved_at: 1, email: null, ...over };
}

const TWO_USERS = { users: [mkUser(), mkUser({ id: "u2", name: "Carol", email: "carol@example.com", platform_admin: 1, disabled_at: 5 })] };

function renderWith(ui: JSX.Element) {
  return { ...renderWithProviders(ui), user: userEvent.setup() };
}

beforeAll(() => {
  // 「进入空间」用 window.location.assign 跳转，jsdom 无真实导航，替换为 spy
  Object.defineProperty(window, "location", { value: { assign: vi.fn(), href: "" }, configurable: true });
});

beforeEach(() => {
  vi.clearAllMocks(); // 首个用例断言「未调用」，调用记录不能跨用例残留
});

test("admin edits quota through the dialog", async () => {
  vi.mocked(listAdminUsers).mockResolvedValue({ users: [mkUser()] });
  vi.mocked(patchAdminUser).mockResolvedValue({ ok: true });
  const { user } = renderWith(<PlatformPage me={ME} kind="users" />);
  await screen.findByText("Bob");
  await user.click(screen.getByRole("button", { name: "编辑配额（Bob）" }));
  const input = screen.getByLabelText("配额（GB）");
  expect(input).toHaveValue(10);
  await user.clear(input);
  await user.type(input, "20");
  await user.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(patchAdminUser).toHaveBeenCalledWith("u1", { quota_bytes: 20 * 1024 ** 3 }));
});

test("admin disables a user only after confirmation, then enters the space", async () => {
  vi.mocked(listAdminUsers).mockResolvedValue({ users: [mkUser()] });
  vi.mocked(patchAdminUser).mockResolvedValue({ ok: true });
  vi.mocked(startActAs).mockResolvedValue({ ok: true });
  const { user } = renderWith(<PlatformPage me={ME} kind="users" />);
  await screen.findByText("Bob");
  await user.click(screen.getByRole("button", { name: "停用（Bob）" }));
  // 危险操作先二次确认：确认前不得发请求
  expect(await screen.findByText(/停用后该账号将立即无法登录/)).toBeInTheDocument();
  expect(patchAdminUser).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "停用" }));
  await waitFor(() => expect(patchAdminUser).toHaveBeenCalledWith("u1", { disabled: true }));
  await user.click(screen.getByRole("button", { name: "进入空间（Bob）" }));
  await waitFor(() => expect(startActAs).toHaveBeenCalledTimes(1));
  expect(startActAs).toHaveBeenCalledWith("u1");
  await waitFor(() => expect(localStorage.getItem("mstor_act_as")).toBe("u1"));
  localStorage.removeItem("mstor_act_as");
});

test("self row does not offer entering your own space", async () => {
  vi.mocked(listAdminUsers).mockResolvedValue({ users: [mkUser({ id: "u-admin", name: "Alice", platform_admin: 1 })] });
  renderWith(<PlatformPage me={ME} kind="users" />);
  await screen.findByText("Alice");
  expect(screen.queryByRole("button", { name: "进入空间（Alice）" })).not.toBeInTheDocument();
});

test("admin approves a pending registration", async () => {
  vi.mocked(listAdminUsers).mockResolvedValue({ users: [mkUser({ approved_at: null })] });
  vi.mocked(patchAdminUser).mockResolvedValue({ ok: true });
  const { user } = renderWith(<PlatformPage me={ME} kind="users" />);
  const approve = await screen.findByRole("button", { name: "通过审核（Bob）" });
  await user.click(approve);
  await waitFor(() => expect(patchAdminUser).toHaveBeenCalledWith("u1", { approved: true }));
});

test("admin binds an email through the dialog with validation", async () => {
  vi.mocked(listAdminUsers).mockResolvedValue({ users: [mkUser()] });
  vi.mocked(patchAdminUser).mockResolvedValue({ ok: true });
  const { user } = renderWith(<PlatformPage me={ME} kind="users" />);
  await screen.findByText("Bob");
  await user.click(screen.getByRole("button", { name: "绑定邮箱（Bob）" }));
  const input = screen.getByLabelText("绑定邮箱");
  await user.type(input, "not-an-email");
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  await user.clear(input);
  await user.type(input, "bob@example.com");
  await user.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(patchAdminUser).toHaveBeenCalledWith("u1", { email: "bob@example.com" }));
});

test("platform_admin 映射为管理员；无个人空间显示未绑定且禁用配额编辑", async () => {
  vi.mocked(listAdminUsers).mockResolvedValue({
    users: [mkUser({ platform_admin: 1 }), mkUser({ id: "u3", name: "NoSpace", quota_bytes: null })],
  });
  renderWith(<PlatformPage me={ME} kind="users" />);
  await screen.findByText("Bob");
  expect(screen.getByText("Bob").closest("tr")).toHaveTextContent("管理员");
  expect(screen.getByText("NoSpace").closest("tr")).toHaveTextContent("未绑定空间");
  expect(screen.getByRole("button", { name: "编辑配额（NoSpace）" })).toBeDisabled();
});

test("admin filters users by keyword and status", async () => {
  vi.mocked(listAdminUsers).mockResolvedValue(TWO_USERS);
  const { user } = renderWith(<PlatformPage me={ME} kind="users" />);
  await screen.findByText("Bob");
  await user.type(screen.getByLabelText("搜索用户"), "carol");
  expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  expect(screen.getByText("Carol")).toBeInTheDocument();
  await user.clear(screen.getByLabelText("搜索用户"));
  await user.selectOptions(screen.getByLabelText("状态筛选"), "disabled");
  expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  // 「已停用」同时出现在筛选下拉的选项里，这里只校验行内状态
  expect(screen.getByText("Carol").closest("tr")).toHaveTextContent("已停用");
});
