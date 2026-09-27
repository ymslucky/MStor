import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
  expect(screen.getByRole("link", { name: "文件" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "回收站" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "分享" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "设置" })).toBeInTheDocument();
  expect(screen.getByText(/40 B/)).toBeInTheDocument(); // usedBytes
  expect(screen.getByRole("link", { name: "退出" })).toHaveAttribute("href", "/auth/logout");
});
