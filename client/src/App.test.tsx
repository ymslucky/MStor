import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import App from "./App";

vi.mock("./api/me", () => ({
  getMe: async () => ({ id: "u1", name: "Alice", role: "admin", quotaBytes: 100, usedBytes: 40, trashRetentionDays: 30, self: { id: "u1", name: "Alice", role: "admin" } }),
}));

test("renders app title", async () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
  // 侧栏品牌与移动端顶栏品牌都在 DOM 中（桌面用 CSS 隐藏移动端品牌）
  expect((await screen.findAllByText("MStor")).length).toBeGreaterThan(0);
});

test("未知路径回首页兜底（陈旧 SW 缓存的 /cdn-cgi/* 回调不再白屏）", async () => {
  render(
    <MemoryRouter initialEntries={["/cdn-cgi/access/authorized"]}>
      <App />
    </MemoryRouter>,
  );
  expect((await screen.findAllByText("MStor")).length).toBeGreaterThan(0);
});

test("懒加载的 /design 页经 Suspense 正常渲染", async () => {
  render(
    <MemoryRouter initialEntries={["/design"]}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("设计系统 v10 · Signal Desk")).toBeInTheDocument();
});

test("/auth/renew 落地后按 next 回跳应用内路径", async () => {
  render(
    <MemoryRouter initialEntries={["/auth/renew?next=/shares"]}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("我的分享")).toBeInTheDocument();
});
