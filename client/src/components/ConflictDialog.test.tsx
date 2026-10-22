import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ConflictDialog } from "./ConflictDialog";

const noop = () => {};

test("列出同名文件并回传所选策略", async () => {
  const onDecide = vi.fn();
  const user = userEvent.setup();
  render(
    <ConflictDialog names={["a.txt", "b.txt"]} remember={false} onRememberChange={noop} onDecide={onDecide} onCancel={noop} />,
  );
  expect(screen.getByText(/有 2 个同名文件/)).toBeInTheDocument();
  expect(screen.getByText(/a\.txt/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "保留两者" }));
  expect(onDecide).toHaveBeenCalledWith("keepBoth");
});

test("Esc 关闭（Radix Dialog 焦点陷阱内）触发 onCancel", async () => {
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(
    <ConflictDialog names={["a.txt"]} remember onRememberChange={noop} onDecide={noop} onCancel={onCancel} />,
  );
  await user.keyboard("{Escape}");
  expect(onCancel).toHaveBeenCalled();
});
