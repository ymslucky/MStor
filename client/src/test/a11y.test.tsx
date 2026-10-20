import { render } from "@testing-library/react";
import { renderWithProviders } from "./utils";
import { describe, expect, test } from "vitest";
import { axe } from "vitest-axe";
import { Badge, Button, Field, IconButton, Input, ListRow, NavItem, Panel } from "../components/ui";
import { Dialog } from "../components/ui/Dialog";
import { ConflictDialog } from "../components/ConflictDialog";
import { BatchBar } from "../components/BatchBar";
import { UndoSnackbar } from "../components/UndoSnackbar";
import { StatusBar } from "../components/StatusBar";
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

describe("无障碍闸门", () => {
  test("原语（Button/Badge/Input/IconButton）", async () => {
    const { container } = wrap(
      <div>
        <Button>保存</Button>
        <Button variant="ghost">取消</Button>
        <Badge tone="accent">已分享</Badge>
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

  test("ConflictDialog / BatchBar / UndoSnackbar", async () => {
    const { container } = wrap(
      <div>
        <ConflictDialog names={["a.txt"]} remember={false} onRememberChange={() => {}} onDecide={() => {}} onCancel={() => {}} />
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
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  test("StatusBar", async () => {
    const { container } = wrap(<StatusBar me={ME} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
