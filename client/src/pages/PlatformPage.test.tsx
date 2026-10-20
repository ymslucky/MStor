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
  getAdminOverview: vi.fn(),
}));

import { listAdminUsers, patchAdminUser } from "../api/me";

// PlatformPage 支持注入 me：直接渲染（不经 Outlet）也能测
const ME: Me = { id: "u-admin", name: "Alice", role: "admin", quotaBytes: 100, usedBytes: 10, trashRetentionDays: 30, self: { id: "u-admin", name: "Alice", role: "admin" } };

function mkUser(over: Partial<AdminUser> = {}): AdminUser {
  return { id: "u1", name: "Bob", role: "member", quota_bytes: 10737418240, created_at: 1, disabled_at: null, email: null, ...over };
}

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

test("admin edits quota via PATCH", async () => {
  vi.mocked(listAdminUsers).mockResolvedValue({ users: [mkUser()] });
  vi.mocked(patchAdminUser).mockResolvedValue({ ok: true });
  const { user } = renderWith(<PlatformPage me={ME} kind="users" />);
  await screen.findByText("Bob");
  const input = screen.getByLabelText("配额 GB（Bob）");
  await user.clear(input);
  await user.type(input, "20");
  await user.click(screen.getByRole("button", { name: /保存配额.*Bob/ }));
  await waitFor(() => expect(patchAdminUser).toHaveBeenCalledWith("u1", { quota_bytes: 20 * 1024 ** 3 }));
});

test("admin toggles disable and enters user space", async () => {
  vi.mocked(listAdminUsers).mockResolvedValue({ users: [mkUser()] });
  vi.mocked(patchAdminUser).mockResolvedValue({ ok: true });
  const { user } = renderWith(<PlatformPage me={ME} kind="users" />);
  await screen.findByText("Bob");
  await user.click(screen.getByRole("button", { name: "停用" }));
  await waitFor(() => expect(patchAdminUser).toHaveBeenCalledWith("u1", { disabled: true }));
  await user.click(screen.getByRole("button", { name: /进入空间/ }));
  expect(localStorage.getItem("mstor_act_as")).toBe("u1");
  localStorage.removeItem("mstor_act_as");
});
