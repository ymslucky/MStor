import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { useLocation } from "react-router-dom";
import { renderWithProviders } from "../test/utils";
import { NotificationBell } from "./NotificationBell";

vi.mock("../api/notifications", () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";

const DAY = 86_400_000;
const today = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0); // 今天正午，避开 0 点边界
  return d.getTime();
})();

const ITEMS = {
  unread: 2,
  items: [
    { id: "n1", workspace_id: "w1", user_id: "u1", kind: "share", title: "收到分享：相册", body: null, link: "/shares", read_at: null, created_at: today },
    { id: "n2", workspace_id: "w1", user_id: "u1", kind: "share", title: "已读通知", body: null, link: null, read_at: today, created_at: today - 1000 },
    { id: "n3", workspace_id: "w1", user_id: "u1", kind: "quota", title: "配额告警", body: null, link: "/trash", read_at: null, created_at: today - 2 * DAY },
    { id: "n4", workspace_id: "w1", user_id: "u1", kind: "quota", title: "旧告警（已读）", body: null, link: null, read_at: today - 2 * DAY, created_at: today - 3 * DAY },
  ],
};

function Probe() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.pathname}</span>;
}

function renderWith() {
  const utils = renderWithProviders(
    <>
      <NotificationBell />
      <Probe />
    </>,
  );
  return { ...utils, user: userEvent.setup() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listNotifications).mockResolvedValue(ITEMS);
  vi.mocked(markNotificationRead).mockResolvedValue({ ok: true });
  vi.mocked(markAllNotificationsRead).mockResolvedValue({ ok: true, marked: 2 });
});

test("未读优先 + 今天/更早分组 + 未读 Pill，全部已读调用接口", async () => {
  const { user } = renderWith();
  // 未读数在打开后才拉取，初始铃铛的可访问名只有「通知」
  await user.click(screen.getByRole("button", { name: /通知/ }));

  expect(await screen.findByText("今天")).toBeInTheDocument();
  expect(screen.getByText("更早")).toBeInTheDocument();
  // 未读数用 Pill 显示
  expect(screen.getByText("未读 2")).toBeInTheDocument();
  // 同一分组内未读排在已读之前
  const unread = screen.getByText("收到分享：相册");
  const read = screen.getByText("已读通知");
  expect(unread.compareDocumentPosition(read) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "全部已读" }));
  await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled());
});

test("列表未拉取时用 initialUnread 显示角标", () => {
  renderWithProviders(<NotificationBell initialUnread={3} />);
  expect(screen.getByRole("button", { name: "通知（3 条未读）" })).toBeInTheDocument();
});

test("Escape 关闭面板并把焦点还给铃铛", async () => {
  const { user } = renderWith();
  const bell = screen.getByRole("button", { name: /通知/ });
  await user.click(bell);
  await screen.findByText("今天");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByText("今天")).not.toBeInTheDocument());
  expect(bell).toHaveFocus();
});

test("单条点击跳转并标记已读", async () => {
  const { user } = renderWith();
  await user.click(screen.getByRole("button", { name: /通知/ }));
  await user.click(await screen.findByText("收到分享：相册"));
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalled());
  // react-query 的 mutationFn 还会收到 context 第二参，这里只校验 id
  expect(vi.mocked(markNotificationRead).mock.calls[0][0]).toBe("n1");
  expect(screen.getByTestId("loc")).toHaveTextContent("/shares");
});
