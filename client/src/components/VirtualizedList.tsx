import { Fragment, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Node } from "../api/types";

/** 虚拟行高（设计规范：列表行高 48px） */
export const ROW_HEIGHT = 48;

/**
 * 视口内虚拟滚动：容器由上层布局给出确定高度（md:flex-1 / md:min-h-0），
 * 自身负责滚动 —— 列表高度与屏幕一致，滚动条出现在列表内部而不是把整页撑长。
 * 测量为 0 的场景（首帧 / jsdom）回落到前 FALLBACK_ROWS 行，避免空白。
 */
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

  useEffect(() => {
    if (focusIndex < 0) return;
    const el = scrollRef.current;
    if (!el || typeof el.scrollTo !== "function") return;
    virtualizer.scrollToIndex(focusIndex);
  }, [focusIndex, virtualizer]);

  const items = virtualizer.getVirtualItems();
  const FALLBACK_ROWS = 30;

  return (
    <div
      ref={scrollRef}
      data-testid="file-virtual"
      className="md:min-h-0 md:flex-1 md:overflow-y-auto"
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() || nodes.length * ROW_HEIGHT }}>
        {items.length === 0
          ? nodes.slice(0, FALLBACK_ROWS).map((n, i) => <Fragment key={n.id}>{row(n, i, i * ROW_HEIGHT)}</Fragment>)
          : items.map((vi) => {
              const n = nodes[vi.index];
              return <Fragment key={n.id}>{row(n, vi.index, vi.start)}</Fragment>;
            })}
      </div>
    </div>
  );
}
