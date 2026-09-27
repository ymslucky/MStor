import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import AppShell from "./AppShell";

vi.mock("../api/me", () => ({
  getMe: async () => ({ id: "u1", name: "Alice", role: "admin", quotaBytes: 100, usedBytes: 40 }),
}));

function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("shows user name, quota and nav links", async () => {
  renderShell();
  expect(await screen.findByText("Alice")).toBeInTheDocument();
  // 桌面/移动共用同一 DOM（responsive 切换），以 role="navigation" 语义断言
  const nav = screen.getByRole("navigation", { name: "主导航" });
  expect(within(nav).getByRole("link", { name: "文件" })).toBeInTheDocument();
  expect(within(nav).getByRole("link", { name: "回收站" })).toBeInTheDocument();
  expect(within(nav).getByRole("link", { name: "分享" })).toBeInTheDocument();
  expect(within(nav).getByRole("link", { name: "设置" })).toBeInTheDocument();
  expect(screen.getByText(/40 B/)).toBeInTheDocument(); // usedBytes
  // 移动顶栏与桌面档案行各有一个退出链接，均指向 logout
  for (const link of screen.getAllByRole("link", { name: "退出" })) {
    expect(link).toHaveAttribute("href", "/auth/logout");
  }
});
