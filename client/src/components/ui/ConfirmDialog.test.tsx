import type { JSX } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderWithProviders } from "../../test/utils";
import { ConfirmDialog } from "./index";

function renderWith(ui: JSX.Element) {
  const utils = renderWithProviders(ui);
  return { ...utils, user: userEvent.setup() };
}

test("renders title and description, nothing when closed", () => {
  const { rerender } = renderWithProviders(
    <ConfirmDialog open title="退出登录" description="确定要退出当前账号吗？" onConfirm={() => {}} onCancel={() => {}} />,
  );
  expect(screen.getByText("退出登录")).toBeInTheDocument();
  expect(screen.getByText("确定要退出当前账号吗？")).toBeInTheDocument();
  rerender(<ConfirmDialog open={false} title="退出登录" onConfirm={() => {}} onCancel={() => {}} />);
  expect(screen.queryByText("退出登录")).not.toBeInTheDocument();
});

test("confirm and cancel fire respective callbacks with default texts", async () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const { user } = renderWith(<ConfirmDialog open title="标题" onConfirm={onConfirm} onCancel={onCancel} />);
  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "确认" }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("custom confirm/cancel texts and danger variant class", () => {
  renderWithProviders(
    <ConfirmDialog open title="删除" confirmText="彻底删除" cancelText="返回" danger onConfirm={() => {}} onCancel={() => {}} />,
  );
  expect(screen.getByRole("button", { name: "彻底删除" })).toHaveClass("text-danger");
  expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
});

test("busy disables confirm button", async () => {
  const onConfirm = vi.fn();
  const { user } = renderWith(<ConfirmDialog open title="标题" busy onConfirm={onConfirm} onCancel={() => {}} />);
  expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "确认" }));
  expect(onConfirm).not.toHaveBeenCalled();
});

test("Escape closes via onCancel", async () => {
  const onCancel = vi.fn();
  const { user } = renderWith(<ConfirmDialog open title="标题" onConfirm={() => {}} onCancel={onCancel} />);
  await user.keyboard("{Escape}");
  expect(onCancel).toHaveBeenCalledTimes(1);
});
