import { render, screen } from "@testing-library/react";
import { renderWithProviders } from "./utils";
import { describe, expect, test, vi } from "vitest";
import { axe } from "vitest-axe";
import { Button, Field, IconButton, Input, ListRow, NavItem, Panel, Pill, SettingRow } from "../components/ui";
import { Dialog } from "../components/ui/Dialog";
import { ConflictDialog } from "../components/ConflictDialog";
import { BatchBar } from "../components/BatchBar";
import { UndoSnackbar } from "../components/UndoSnackbar";
import { StatusBar } from "../components/StatusBar";
import { MobileNavDrawer } from "../shell/MobileNavDrawer";
import { AdminUsersSection } from "../components/AdminUsersSection";
import { CommandPalette } from "../components/CommandPalette";
import { NotificationBell } from "../components/NotificationBell";
import userEvent from "@testing-library/user-event";
import type { Me } from "../api/types";
import { Cloud } from "lucide-react";

/**
 * 无障碍闸门：页面级与浮层组件必须无 axe 违规。
 * 新增浮层/原语时在这里补一条用例，否则视为未登记。
 */

const ME = {
  id: "u1",
  name: "张三",
  email: "a@b.c",
  role: "admin",
  usedBytes: 40,
  quotaBytes: 100,
  trashRetentionDays: 30,
  self: { id: "u1", name: "张三", role: "admin" },
  workspace: { id: "w1", name: "我的空间", role: "owner" },
  workspaces: [],
  unreadNotifications: 0,
  storage: { activeBytes: 40, trashBytes: 0, usedBytes: 40, quotaBytes: 100, level: "ok" },
} as unknown as Me;

const wrap = (ui: React.ReactElement) => renderWithProviders(ui);

vi.mock("../api/me", () => ({
  listAdminUsers: vi.fn(async () => ({
    users: [
      { id: "u1", name: "张三", role: "admin", quota_bytes: 10737418240, created_at: 1, disabled_at: null, email: "a@b.c" },
      { id: "u2", name: "李四", role: "member", quota_bytes: 5368709120, created_at: 1, disabled_at: 2, email: null },
    ],
  })),
  patchAdminUser: vi.fn(),
}));
vi.mock("../api/search", () => ({ searchNodes: vi.fn(async () => ({ nodes: [], paths: {} })) }));
vi.mock("../api/library", () => ({ listRecent: vi.fn(async () => ({ nodes: [] })) }));
vi.mock("../api/notifications", () => ({
  listNotifications: vi.fn(async () => ({
    unread: 1,
    items: [
      { id: "n1", workspace_id: "w1", user_id: "u1", kind: "share", title: "收到分享", body: null, link: null, read_at: null, created_at: Date.now() },
    ],
  })),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

describe("无障碍闸门", () => {
  test("原语（Button/Pill/Input/IconButton）", async () => {
    const { container } = wrap(
      <div>
        <Button>保存</Button>
        <Button variant="ghost">取消</Button>
        <Pill tone="accent">已分享</Pill>
        <Input aria-label="名称" placeholder="名称" />
        <IconButton label="关闭">
          <Cloud size={16} aria-hidden />
        </IconButton>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  test("Dialog（Radix）", async () => {
    const { baseElement } = render(
      <Dialog open onClose={() => {}} title="删除文件">
        <p>确定删除？</p>
      </Dialog>,
    );
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  test("ConflictDialog（Radix modal，Portal 到 body）", async () => {
    const { baseElement } = wrap(
      <ConflictDialog names={["a.txt"]} remember={false} onRememberChange={() => {}} onDecide={() => {}} onCancel={() => {}} />,
    );
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  test("BatchBar / UndoSnackbar（非 modal，独立扫描避免被 modal 的 aria-hidden 隐藏）", async () => {
    const { container } = wrap(
      <div>
        <BatchBar count={2} hasFileSelected onDownload={() => {}} onMove={() => {}} onDelete={() => {}} onClear={() => {}} />
        <UndoSnackbar message="已移动" onUndo={() => {}} onClose={() => {}} />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  test("S3 原语（Panel / Field / ListRow / NavItem）", async () => {
    const { container } = wrap(
      <div>
        <Panel level="e2">
          <ListRow selected>选中行</ListRow>
          <ListRow>普通行</ListRow>
        </Panel>
        <Field label="名称" hint="用于展示" required>
          <Input placeholder="名称" />
        </Field>
        <Field label="出错字段" error="必填项缺失">
          <Input defaultValue="x" />
        </Field>
        <NavItem to="/">导航项</NavItem>
        <SettingRow title="上传并发" hint="同时上传的分片数">
          <Field label="并发数">
            <Input defaultValue="4" />
          </Field>
        </SettingRow>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  test("命令面板（⌘K）", async () => {
    const { baseElement } = wrap(<CommandPalette />);
    await userEvent.setup().click(screen.getByRole("button", { name: "搜索（⌘K）" }));
    await screen.findByLabelText("搜索");
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  test("通知面板", async () => {
    const { baseElement } = wrap(<NotificationBell />);
    await userEvent.setup().click(screen.getByRole("button", { name: /通知/ }));
    await screen.findByText("收到分享");
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  test("平台用户管理表格", async () => {
    const { container } = wrap(<AdminUsersSection selfId="u1" />);
    await screen.findByText("张三");
    expect(await axe(container)).toHaveNoViolations();
  });

  test("StatusBar", async () => {
    const { container } = wrap(<StatusBar me={ME} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  test("移动端导航抽屉（Radix Dialog 承载焦点与 Esc）", async () => {
    const { baseElement } = wrap(
      <MobileNavDrawer open onClose={() => {}} me={ME} onSwitchWorkspace={() => {}} onLogout={() => {}} />,
    );
    expect(await screen.findByTestId("mobile-drawer")).toBeInTheDocument();
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
