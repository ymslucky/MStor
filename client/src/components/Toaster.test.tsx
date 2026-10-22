import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Toaster, toast } from "./Toaster";

test("toast 支持动作按钮，点击后执行并关闭", async () => {
  const onClick = vi.fn();
  render(<Toaster />);
  toast("发现新版本", "info", { label: "刷新", onClick });
  expect(await screen.findByText("发现新版本")).toBeInTheDocument();
  // jsdom 未实现 hasPointerCapture，Radix Toast 的 swipe 指针序列会抛错；直接派发 click 验证动作
  fireEvent.click(screen.getByRole("button", { name: "刷新" }));
  expect(onClick).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByText("发现新版本")).not.toBeInTheDocument());
});
