import type { JSX } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Node } from "../api/types";
import { Toaster } from "./Toaster";
import ShareDialog from "./ShareDialog";

vi.mock("../api/shares", () => ({
  createShare: vi.fn(),
}));

import { createShare } from "../api/shares";

function node(): Node {
  return { id: "f1", parent_id: "", name: "全家福.jpg", is_dir: 0, size: 10, mime: "image/jpeg", created_at: 1, updated_at: 2 };
}

test("默认 7 天有效期，带提取码创建分享", async () => {
  vi.mocked(createShare).mockResolvedValue({ token: "tok123", url: "https://stor.msxor.com/s/tok123" });
  const { user } = renderWith(<ShareDialog node={node()} onClose={() => {}} />);
  // 默认值即 7 天（用户反馈：默认永久改为默认 7 天）
  expect(screen.getByLabelText("有效天数（可选）")).toHaveValue(7);
  await user.type(screen.getByLabelText("提取码（可选）"), "1234");
  await user.click(screen.getByRole("button", { name: "创建" }));
  await waitFor(() =>
    expect(createShare).toHaveBeenCalledWith({ nodeId: "f1", expiresInDays: 7, password: "1234" }),
  );
  // URL 渲染在只读 input 的 value 里，需用 displayValue 断言
  expect(await screen.findByDisplayValue(/\/s\/tok123/)).toBeInTheDocument();
});

test("createShare reject 时显示错误提示", async () => {
  vi.mocked(createShare).mockRejectedValueOnce(new Error("名称已存在"));
  const { user } = renderWith(
    <>
      <ShareDialog node={node()} onClose={() => {}} />
      <Toaster />
    </>,
  );
  await user.click(screen.getByRole("button", { name: "创建" }));
  expect(await screen.findByText("名称已存在")).toBeInTheDocument();
});

function renderWith(ui: JSX.Element) {
  const utils = render(ui);
  return { ...utils, user: userEvent.setup() };
}
