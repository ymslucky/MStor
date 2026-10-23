import type { JSX } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import type { Me } from "../api/types";
import { renderWithProviders } from "../test/utils";
import SettingsPage from "./SettingsPage";

vi.mock("../api/me", () => ({
  listAdminUsers: vi.fn(),
  patchAdminUser: vi.fn(),
  getAdminSettings: vi.fn(),
  patchAdminSettings: vi.fn(),
  getAdminOverview: vi.fn(),
}));

import { getAdminSettings, patchAdminSettings } from "../api/me";

const ME: Me = { id: "u-admin", name: "Alice", role: "admin", quotaBytes: 100, usedBytes: 10, trashRetentionDays: 30, self: { id: "u-admin", name: "Alice", role: "admin" } };

function renderWith(ui: JSX.Element) {
  return { ...renderWithProviders(ui), user: userEvent.setup() };
}

beforeEach(() => {
  vi.clearAllMocks(); // 首个用例断言「未调用」，调用记录不能跨用例残留
  vi.mocked(getAdminSettings).mockResolvedValue({ trash_retention_days: 30, audit_enabled: true });
});

test("account tab shows login account info", async () => {
  renderWith(<SettingsPage me={ME} />);
  expect(await screen.findByText("账户信息")).toBeInTheDocument();
  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("管理员")).toBeInTheDocument();
});

test("upload tab saves concurrency to localStorage", async () => {
  const { user } = renderWith(<SettingsPage me={ME} />);
  await user.click(await screen.findByRole("link", { name: "上传" }));
  const input = screen.getByLabelText(/并发数/);
  await user.clear(input);
  await user.type(input, "8");
  await user.click(screen.getByRole("button", { name: "保存并发数" }));
  expect(localStorage.getItem("mstor_upload_concurrency")).toBe("8");
  localStorage.removeItem("mstor_upload_concurrency");
});

// 保留期已归入「上传」分区（平台管理员可见），不再依赖设置页的管理标签
test("admin saves trash retention days in upload tab", async () => {
  vi.mocked(getAdminSettings).mockResolvedValue({ trash_retention_days: 30, audit_enabled: true });
  vi.mocked(patchAdminSettings).mockResolvedValue({ ok: true });
  const { user } = renderWith(<SettingsPage me={ME} />);
  await user.click(await screen.findByRole("link", { name: "上传" }));
  const input = await screen.findByLabelText(/保留天数/);
  // 默认展示服务端值
  expect(input).toHaveValue(30);
  await user.clear(input);
  await user.type(input, "7");
  await user.click(screen.getByRole("button", { name: "保存保留天数" }));
  await waitFor(() => expect(patchAdminSettings).toHaveBeenCalledWith({ trash_retention_days: 7 }));
});

test("admin can turn the audit feature off from upload tab", async () => {
  vi.mocked(getAdminSettings).mockResolvedValue({ trash_retention_days: 30, audit_enabled: true });
  vi.mocked(patchAdminSettings).mockResolvedValue({ ok: true });
  const { user } = renderWith(<SettingsPage me={ME} />);
  await user.click(await screen.findByRole("link", { name: "审计" }));
  const toggle = await screen.findByRole("checkbox", { name: "已开启" });
  expect(toggle).toBeChecked();
  await user.click(toggle);
  await waitFor(() => expect(patchAdminSettings).toHaveBeenCalledWith({ audit_enabled: false }));
});
