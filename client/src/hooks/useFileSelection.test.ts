import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useFileSelection } from "./useFileSelection";

const IDS = ["a", "b", "c", "d", "e"];

test("toggle adds and removes ids and tracks count", () => {
  const { result } = renderHook(() => useFileSelection(IDS));
  expect(result.current.count).toBe(0);
  act(() => result.current.toggle("a"));
  act(() => result.current.toggle("c"));
  expect(result.current.count).toBe(2);
  expect(result.current.isSelected("a")).toBe(true);
  expect(result.current.isSelected("b")).toBe(false);
  act(() => result.current.toggle("a"));
  expect(result.current.count).toBe(1);
  expect(result.current.isSelected("a")).toBe(false);
});

test("selectRange picks inclusive span anchored at last toggled id", () => {
  const { result } = renderHook(() => useFileSelection(IDS));
  act(() => result.current.toggle("b")); // 锚点 b
  act(() => result.current.selectRange("d"));
  expect([...result.current.selected]).toEqual(["b", "c", "d"]);
  // 反向：锚点在后，仍按区间序返回
  act(() => result.current.clear());
  act(() => result.current.toggle("d"));
  act(() => result.current.selectRange("a"));
  expect([...result.current.selected]).toEqual(["a", "b", "c", "d"]);
});

test("selectRange replaces previous selection", () => {
  const { result } = renderHook(() => useFileSelection(IDS));
  act(() => result.current.toggle("a"));
  act(() => result.current.toggle("b")); // 锚点 b
  act(() => result.current.selectRange("e"));
  expect([...result.current.selected]).toEqual(["b", "c", "d", "e"]);
});

test("selectRange without anchor selects single id", () => {
  const { result } = renderHook(() => useFileSelection(IDS));
  act(() => result.current.selectRange("c"));
  expect([...result.current.selected]).toEqual(["c"]);
});

test("selectRange with id outside list falls back to single", () => {
  const { result } = renderHook(() => useFileSelection(IDS));
  act(() => result.current.toggle("a"));
  act(() => result.current.selectRange("zz"));
  expect([...result.current.selected]).toEqual(["zz"]);
});

test("selectAll selects all ids, clear empties", () => {
  const { result } = renderHook(() => useFileSelection(IDS));
  act(() => result.current.selectAll());
  expect(result.current.count).toBe(5);
  act(() => result.current.clear());
  expect(result.current.count).toBe(0);
  expect([...result.current.selected]).toEqual([]);
});

test("changing resetKey clears selection", () => {
  const { result, rerender } = renderHook(({ key }) => useFileSelection(IDS, key), {
    initialProps: { key: "dir-1" },
  });
  act(() => result.current.toggle("a"));
  expect(result.current.count).toBe(1);
  rerender({ key: "dir-2" });
  expect(result.current.count).toBe(0);
});
