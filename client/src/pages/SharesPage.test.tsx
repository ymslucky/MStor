import type { JSX } from "react";
import { screen, waitFor } from "@testing-library/react";
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

test("revoke calls revokeShare and refreshes", async () => {
  // 首次返回一条，失效重拉后返回空，才能断言「暂无分享」
  vi.mocked(listShares).mockResolvedValueOnce({ shares: [share()] }).mockResolvedValue({ shares: [] });
  vi.mocked(revokeShare).mockResolvedValue({ ok: true });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { user } = renderWith(<SharesPage />);
  await screen.findByText(/全家福\.jpg/);
  await user.click(screen.getByRole("button", { name: "撤销" }));
  await waitFor(() => expect(revokeShare).toHaveBeenCalledWith("sh1"));
  await waitFor(() => expect(screen.getByText(/暂无分享/)).toBeInTheDocument());
  vi.restoreAllMocks();
});
