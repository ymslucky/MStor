import type { JSX } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { AdminUser, Me } from "../api/types";
import { renderWithProviders } from "../test/utils";
import SettingsPage from "./SettingsPage";

vi.mock("../api/me", () => ({
  setWebdavPassword: vi.fn(),
  listAdminUsers: vi.fn(),
  patchAdminUser: vi.fn(),
  getAdminSettings: vi.fn(),
  patchAdminSettings: vi.fn(),
}));

import { getAdminSettings, listAdminUsers, patchAdminSettings, patchAdminUser, setWebdavPassword } from "../api/me";

const ME: Me = { id: "u-admin", name: "Alice", role: "admin", quotaBytes: 100, usedBytes: 10, trashRetentionDays: 30, self: { id: "u-admin", name: "Alice", role: "admin" } };

function mkUser(over: Partial<AdminUser> = {}): AdminUser {
  return { id: "u1", name: "Bob", role: "member", quota_bytes: 10737418240, created_at: 1, disabled_at: null, ...over };
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

test("saves webdav password (min 8 chars enforced client-side)", async () => {
  vi.mocked(setWebdavPassword).mockResolvedValue({ ok: true });
  const { user } = renderWith(<SettingsPage me={ME} />);
  await screen.findByText("WebDAV");
  await user.type(screen.getByLabelText("WebDAV 应用密码"), "short");
  await user.click(screen.getByRole("button", { name: "保存密码" }));
  expect(setWebdavPassword).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("WebDAV 应用密码"), "123456789");
  await user.click(screen.getByRole("button", { name: "保存密码" }));
  await waitFor(() => expect(setWebdavPassword).toHaveBeenCalledWith("short123456789"));
});

test("admin edits quota via PATCH", async () => {
  vi.mocked(listAdminUsers).mockResolvedValue({ users: [mkUser()] });
  vi.mocked(patchAdminUser).mockResolvedValue({ ok: true });
  const { user } = renderWith(<SettingsPage me={ME} />);
  await user.click(await screen.findByRole("tab", { name: "管理" }));
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
  const { user } = renderWith(<SettingsPage me={ME} />);
  await user.click(await screen.findByRole("tab", { name: "管理" }));
  await screen.findByText("Bob");
  await user.click(screen.getByRole("button", { name: "停用" }));
  await waitFor(() => expect(patchAdminUser).toHaveBeenCalledWith("u1", { disabled: true }));
  await user.click(screen.getByRole("button", { name: /进入空间/ }));
  expect(localStorage.getItem("mstor_act_as")).toBe("u1");
  localStorage.removeItem("mstor_act_as");
});

test("upload tab saves concurrency to localStorage", async () => {
  const { user } = renderWith(<SettingsPage me={ME} />);
  await user.click(await screen.findByRole("tab", { name: "上传" }));
  const input = screen.getByLabelText("上传并发数");
  await user.clear(input);
  await user.type(input, "8");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(localStorage.getItem("mstor_upload_concurrency")).toBe("8");
  localStorage.removeItem("mstor_upload_concurrency");
});

test("admin saves trash retention days", async () => {
  vi.mocked(getAdminSettings).mockResolvedValue({ trash_retention_days: 30 });
  vi.mocked(patchAdminSettings).mockResolvedValue({ ok: true });
  const { user } = renderWith(<SettingsPage me={ME} />);
  await user.click(await screen.findByRole("tab", { name: "管理" }));
  const input = await screen.findByLabelText("回收站保留天数");
  // 默认展示服务端值
  expect(input).toHaveValue(30);
  await user.clear(input);
  await user.type(input, "7");
  await user.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(patchAdminSettings).toHaveBeenCalledWith({ trash_retention_days: 7 }));
});
