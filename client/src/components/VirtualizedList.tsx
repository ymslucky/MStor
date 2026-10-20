import { Fragment, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Node } from "../api/types";

/** 虚拟行高（设计规范：列表行高 48px） */
export const ROW_HEIGHT = 48;

/** 虚拟滚动窗口：固定行高 + 绝对定位行（grid 模板由行自身携带） */
export default function VirtualizedList({
  nodes,
  focusIndex = -1,
  row,
}: {
  nodes: Node[];
  focusIndex?: number;
  row: (n: Node, index: number, top: number) => ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // 键盘焦点行滚动进可视区（jsdom 无 Element.scrollTo，跳过）
  useEffect(() => {
    if (focusIndex < 0) return;
    const el = scrollRef.current;
    if (!el || typeof el.scrollTo !== "function") return;
    virtualizer.scrollToIndex(focusIndex);
  }, [focusIndex, virtualizer]);

  return (
    <div ref={scrollRef} data-testid="file-virtual" className="min-h-0">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const n = nodes[vi.index];
          return <Fragment key={n.id}>{row(n, vi.index, vi.start)}</Fragment>;
        })}
      </div>
    </div>
  );
}