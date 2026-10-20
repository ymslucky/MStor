import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): ReactNode {
  throw new Error("boom");
}

test("渲染抛错时显示兜底页而不是白屏", () => {
  // 兜底页会补 console.error（渲染错误留控制台），测试期间静音，断言只看 UI
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.getByText("页面出错了")).toBeInTheDocument();
  expect(screen.getByText("界面遇到未预期的问题，你的文件没有受到影响。")).toBeInTheDocument();
  expect(screen.getByText("错误详情")).toBeInTheDocument();
  spy.mockRestore();
});

test("重新加载按钮调用注入的续期动作（不整页刷新）", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const onReload = vi.fn();
  render(
    <ErrorBoundary title="这个页面出错了" onReload={onReload}>
      <Boom />
    </ErrorBoundary>,
  );
  expect(screen.getByText("这个页面出错了")).toBeInTheDocument();
  screen.getByRole("button", { name: "重新加载" }).click();
  expect(onReload).toHaveBeenCalledTimes(1);
  spy.mockRestore();
});
