import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { expect, test, vi } from "vitest";
import { useKeyboardNav } from "./useKeyboardNav";

function Harness({
  count,
  horizontal,
  onOpen,
  onDelete,
  onRename,
  onPreview,
  onSelectAll,
}: {
  count: number;
  horizontal?: boolean;
  onOpen?: (i: number) => void;
  onDelete?: (i: number) => void;
  onRename?: (i: number) => void;
  onPreview?: (i: number) => void;
  onSelectAll?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const nav = useKeyboardNav({
    count,
    horizontal,
    containerRef: ref,
    onOpen,
    onDelete,
    onRename,
    onPreview,
    onSelectAll,
  });
  return (
    <div ref={ref} data-testid="nav-container" onKeyDown={nav.onKeyDown}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} data-file-row={i} tabIndex={-1}>{`row-${i}`}</div>
      ))}
    </div>
  );
}

const row = (i: number) => document.querySelector(`[data-file-row="${i}"]`);

test("ArrowDown/ArrowUp move focus and clamp at edges", () => {
  render(<Harness count={3} />);
  const c = screen.getByTestId("nav-container");
  fireEvent.keyDown(c, { key: "ArrowDown" });
  expect(document.activeElement).toBe(row(0));
  fireEvent.keyDown(c, { key: "ArrowDown" });
  expect(document.activeElement).toBe(row(1));
  fireEvent.keyDown(c, { key: "ArrowUp" });
  expect(document.activeElement).toBe(row(0));
  fireEvent.keyDown(c, { key: "ArrowUp" }); // 顶部钳制
  expect(document.activeElement).toBe(row(0));
});

test("Enter opens, Delete deletes, F2 renames, Space previews at focus index", () => {
  const onOpen = vi.fn();
  const onDelete = vi.fn();
  const onRename = vi.fn();
  const onPreview = vi.fn();
  render(<Harness count={3} onOpen={onOpen} onDelete={onDelete} onRename={onRename} onPreview={onPreview} />);
  const c = screen.getByTestId("nav-container");
  fireEvent.keyDown(c, { key: "ArrowDown" });
  fireEvent.keyDown(c, { key: "ArrowDown" }); // index 1
  fireEvent.keyDown(c, { key: "Enter" });
  expect(onOpen).toHaveBeenCalledWith(1);
  fireEvent.keyDown(c, { key: "Delete" });
  expect(onDelete).toHaveBeenCalledWith(1);
  fireEvent.keyDown(c, { key: "F2" });
  expect(onRename).toHaveBeenCalledWith(1);
  fireEvent.keyDown(c, { key: " " });
  expect(onPreview).toHaveBeenCalledWith(1);
});

test("Enter/Space do nothing before any navigation", () => {
  const onOpen = vi.fn();
  const onPreview = vi.fn();
  render(<Harness count={2} onOpen={onOpen} onPreview={onPreview} />);
  const c = screen.getByTestId("nav-container");
  fireEvent.keyDown(c, { key: "Enter" });
  fireEvent.keyDown(c, { key: " " });
  expect(onOpen).not.toHaveBeenCalled();
  expect(onPreview).not.toHaveBeenCalled();
});

test("Space prevents default page scroll", () => {
  render(<Harness count={2} />);
  const c = screen.getByTestId("nav-container");
  let defaultPrevented = false;
  const onWin = (e: KeyboardEvent) => {
    if (e.key === " ") defaultPrevented = e.defaultPrevented;
  };
  window.addEventListener("keydown", onWin);
  fireEvent.keyDown(c, { key: " " });
  window.removeEventListener("keydown", onWin);
  expect(defaultPrevented).toBe(true);
});

test("horizontal mode: ArrowRight/ArrowLeft also move focus", () => {
  render(<Harness count={3} horizontal />);
  const c = screen.getByTestId("nav-container");
  fireEvent.keyDown(c, { key: "ArrowRight" });
  expect(document.activeElement).toBe(row(0));
  fireEvent.keyDown(c, { key: "ArrowRight" });
  expect(document.activeElement).toBe(row(1));
  fireEvent.keyDown(c, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(row(0));
});

test("vertical mode: ArrowRight/ArrowLeft are ignored", () => {
  render(<Harness count={3} />);
  const c = screen.getByTestId("nav-container");
  fireEvent.keyDown(c, { key: "ArrowRight" });
  fireEvent.keyDown(c, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(document.body);
});

test("Ctrl/Cmd+A calls onSelectAll", () => {
  const onSelectAll = vi.fn();
  render(<Harness count={2} onSelectAll={onSelectAll} />);
  fireEvent.keyDown(screen.getByTestId("nav-container"), { key: "a", ctrlKey: true });
  fireEvent.keyDown(screen.getByTestId("nav-container"), { key: "a", metaKey: true });
  expect(onSelectAll).toHaveBeenCalledTimes(2);
});

test("count=0: arrows are no-ops", () => {
  render(<Harness count={0} />);
  const c = screen.getByTestId("nav-container");
  fireEvent.keyDown(c, { key: "ArrowDown" });
  fireEvent.keyDown(c, { key: "ArrowUp" });
  expect(document.activeElement).toBe(document.body);
});
