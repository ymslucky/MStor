import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import App from "./App";

vi.mock("./api/me", () => ({
  getMe: async () => ({ id: "u1", name: "Alice", role: "admin", quotaBytes: 100, usedBytes: 40 }),
}));

test("renders app title", async () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("MStor")).toBeInTheDocument();
});
