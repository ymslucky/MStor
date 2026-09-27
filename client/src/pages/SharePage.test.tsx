import type { JSX } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ApiError } from "../api/client";
import type { ShareInfo } from "../api/types";
import { renderWithProviders } from "../test/utils";
import { Route, Routes } from "react-router-dom";
import SharePage from "./SharePage";

vi.mock("../api/shares", async () => ({
  ...(await vi.importActual<typeof import("../api/shares")>("../api/shares")),
  fetchShare: vi.fn(),
  fetchShareChildren: vi.fn(),
  downloadShared: vi.fn(),
}));

import { downloadShared, fetchShare, fetchShareChildren } from "../api/shares";

function info(over: Partial<ShareInfo> = {}): ShareInfo {
  return {
    id: "p1",
    name: "相册", isDir: true, size: null, mime: null, hasPassword: false, expiresAt: null,
    children: [
      { id: "p1", name: "日落.jpg", isDir: false, size: 100, mime: "image/jpeg" },
      { id: "p2", name: "子目录", isDir: true, size: null, mime: null },
    ],
    ...over,
  };
}

// 经 /s/:token 路由挂载，useParams 才能取到 token
function renderWith(ui: JSX.Element, route = "/s/tok123") {
  const utils = renderWithProviders(
    <Routes>
      <Route path="/s/:token" element={ui} />
    </Routes>,
    { route },
  );
  return { ...utils, user: userEvent.setup() };
}

test("renders folder share and browses into subdirectory", async () => {
  vi.mocked(fetchShare).mockResolvedValue(info());
  vi.mocked(fetchShareChildren).mockResolvedValue({ name: "子目录", children: [{ id: "p3", name: "内部.txt", isDir: false, size: 3, mime: "text/plain" }] });
  const { user } = renderWith(<SharePage />);
  expect(await screen.findByText("相册")).toBeInTheDocument();
  expect(screen.getByText("日落.jpg")).toBeInTheDocument();
  await user.click(screen.getByText("子目录"));
  expect(await screen.findByText("内部.txt")).toBeInTheDocument();
  expect(fetchShareChildren).toHaveBeenCalledWith("tok123", "p2", undefined);
  // 面包屑可回根
  await user.click(screen.getByRole("button", { name: /相册/ }));
  await waitFor(() => expect(screen.getByText("日落.jpg")).toBeInTheDocument());
});

test("password gate: asks code then retries with header", async () => {
  vi.mocked(fetchShare)
    .mockRejectedValueOnce(new ApiError(401, "SHARE_PASSWORD", "需要提取码"))
    .mockResolvedValue(info({ hasPassword: true, children: [{ id: "p1", name: "机密.pdf", isDir: false, size: 1, mime: "application/pdf" }] }));
  const { user } = renderWith(<SharePage />);
  expect(await screen.findByText(/需要提取码/)).toBeInTheDocument();
  await user.type(screen.getByLabelText("提取码"), "8888");
  await user.click(screen.getByRole("button", { name: "解锁" }));
  expect(await screen.findByText("机密.pdf")).toBeInTheDocument();
  expect(fetchShare).toHaveBeenLastCalledWith("tok123", "8888");
});

test("shows expired and revoked states", async () => {
  vi.mocked(fetchShare).mockRejectedValue(new ApiError(410, "SHARE_EXPIRED", "分享已过期"));
  renderWith(<SharePage />);
  expect(await screen.findByText(/分享已过期/)).toBeInTheDocument();
});

test("file click downloads via blob helper", async () => {
  vi.mocked(fetchShare).mockResolvedValue(info({ isDir: false, name: "single.jpg", children: undefined }));
  const { user } = renderWith(<SharePage />);
  await screen.findByText("single.jpg");
  await user.click(screen.getByRole("button", { name: /下载 single.jpg/ }));
  await waitFor(() => expect(downloadShared).toHaveBeenCalledWith("tok123", "p1", "single.jpg", undefined));
});
