import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderWithProviders } from "../../test/utils";
import { Dialog } from "./index";

test("renders title, children and footer; renders nothing when closed", () => {
  const { rerender } = renderWithProviders(
    <Dialog open title="移动「a.txt」到…" onClose={() => {}} footer={<button>确定</button>}>
      <input aria-label="名称" defaultValue="a.txt" />
    </Dialog>,
  );
  expect(screen.getByText("移动「a.txt」到…")).toBeInTheDocument();
  expect(screen.getByLabelText("名称")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确定" })).toBeInTheDocument();
  rerender(<Dialog open={false} title="移动「a.txt」到…" onClose={() => {}}>内容</Dialog>);
  expect(screen.queryByText("移动「a.txt」到…")).not.toBeInTheDocument();
});

test("Escape closes dialog", async () => {
  const onClose = vi.fn();
  const utils = renderWithProviders(<Dialog open title="标题" onClose={onClose}>内容</Dialog>);
  const user = userEvent.setup();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(utils.container).toBeInTheDocument();
});

test("mask click closes, click inside panel does not", async () => {
  const onClose = vi.fn();
  renderWithProviders(<Dialog open title="标题" onClose={onClose}>内容</Dialog>);
  const user = userEvent.setup();
  await user.click(screen.getByTestId("dialog-panel"));
  expect(onClose).not.toHaveBeenCalled();
  await user.click(screen.getByTestId("dialog-mask"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("panel is glass-modal with mobile bottom-sheet classes", () => {
  renderWithProviders(<Dialog open title="标题" onClose={() => {}}>内容</Dialog>);
  expect(screen.getByTestId("dialog-mask")).toHaveClass("z-40", "bg-black/40");
  const panel = screen.getByTestId("dialog-panel");
  expect(panel).toHaveClass("glass-modal", "rounded-t-panel", "w-full", "sm:max-w-md", "sm:rounded-panel", "transition-transform", "ease-out-soft");
});
