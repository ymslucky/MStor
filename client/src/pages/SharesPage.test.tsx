import type { JSX } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Share } from "../api/types";
import { renderWithProviders } from "../test/utils";
import SharesPage from "./SharesPage";

vi.mock("../api/shares", () => ({
  listShares: vi.fn(),
  revokeShare: vi.fn(),
}));

import { listShares, revokeShare } from "../api/shares";

function share(over: Partial<Share> = {}): Share {
  return {
    id: "sh1", node_id: "f1", token: "tok-abc", expires_at: null, downloads: 3,
    created_at: 1, node_name: "全家福.jpg", node_is_dir: 0, node_size: 10, ...over,
  };
}

function renderWith(ui: JSX.Element) {
  const utils = renderWithProviders(ui);
  return { ...utils, user: userEvent.setup() };
}

test("lists shares with url, downloads and expiry", async () => {
  vi.mocked(listShares).mockResolvedValue({ shares: [share({ expires_at: 1876176000000 })] }); // 2029-06-15，任意时区年份均为 2029
  renderWith(<SharesPage />);
  expect(await screen.findByText(/全家福\.jpg/)).toBeInTheDocument();
  expect(screen.getByText(/tok-abc/)).toBeInTheDocument();
  expect(screen.getByText(/已下载 3 次/)).toBeInTheDocument(); // 下载次数
  expect(screen.getByText(/2029/)).toBeInTheDocument(); // 有效期至
});

test("过期分享显示「已过期」灰标，未过期不显示", async () => {
  vi.mocked(listShares).mockResolvedValue({
    shares: [
      share({ id: "expired", token: "tok-old", node_name: "旧文件.txt", expires_at: Date.now() - 1000 }),
      share({ id: "active", token: "tok-new", node_name: "新文件.txt", expires_at: Date.now() + 86400000 }),
    ],
  });
  renderWith(<SharesPage />);
  expect(await screen.findByText("已过期")).toBeInTheDocument();
  // 只有过期那一条带灰标（token 路径用于区分行）
  const expiredRow = screen.getByText(/tok-old/).closest("tr")!;
  expect(within(expiredRow).getByText("已过期")).toBeInTheDocument();
  const activeRow = screen.getByText(/tok-new/).closest("tr")!;
  expect(within(activeRow).queryByText("已过期")).toBeNull();
});

test("revoke asks confirm then calls revokeShare and refreshes", async () => {
  // 首次返回一条，失效重拉后返回空，才能断言「暂无分享」
  vi.mocked(listShares).mockResolvedValueOnce({ shares: [share()] }).mockResolvedValue({ shares: [] });
  vi.mocked(revokeShare).mockResolvedValue({ ok: true });
  const { user } = renderWith(<SharesPage />);
  await screen.findByText(/全家福\.jpg/);
  await user.click(screen.getByRole("button", { name: "撤销" }));
  expect(await screen.findByText(/撤销「全家福\.jpg」的分享？/)).toBeInTheDocument();
  expect(revokeShare).not.toHaveBeenCalled();
  // 弹窗内确认按钮与行内 IconButton 同名，限定面板内点击
  await user.click(within(await screen.findByTestId("dialog-panel")).getByRole("button", { name: "撤销" }));
  await waitFor(() => expect(revokeShare).toHaveBeenCalledWith("sh1"));
  await waitFor(() => expect(screen.getByText(/暂无分享/)).toBeInTheDocument());
});
