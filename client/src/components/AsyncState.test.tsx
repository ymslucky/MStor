import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AsyncState } from "./AsyncState";

const base = { isPending: false, isError: false, error: null as unknown, data: undefined as unknown, refetch: vi.fn() };

test("pending 渲染骨架并标记 aria-busy", () => {
  const { container } = render(<AsyncState query={{ ...base, isPending: true }}>内容</AsyncState>);
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(screen.queryByText("内容")).not.toBeInTheDocument();
});

test("error 且无缓存数据：显示可重试错误态，不渲染内容", async () => {
  const refetch = vi.fn();
  const user = userEvent.setup();
  render(
    <AsyncState query={{ ...base, isError: true, error: new Error("网络断了"), refetch }}>内容</AsyncState>,
  );
  expect(screen.getByText("加载失败")).toBeInTheDocument();
  expect(screen.queryByText("内容")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "重试" }));
  expect(refetch).toHaveBeenCalledTimes(1);
});

test("error 但有缓存数据：继续展示内容 + 顶部内联错误条（离线缓存界面）", () => {
  render(
    <AsyncState query={{ ...base, isError: true, error: new Error("断网"), data: { nodes: [] }, refetch: vi.fn() }}>
      缓存内容
    </AsyncState>,
  );
  expect(screen.getByText("缓存内容")).toBeInTheDocument();
  expect(screen.getByText(/显示的是缓存内容/)).toBeInTheDocument();
});
