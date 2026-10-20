import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { Node } from "../api/types";

/** 虚拟行高（设计规范：列表行高 48px） */
export const ROW_HEIGHT = 48;

/**
 * 窗口级虚拟滚动：滚动的是页面本身，不再有内层滚动容器。
 * 这样列表既不会在视口还有空白时就出现滚动条，也没有「外层裁剪 + 内层不滚」导致的卡死。
 * 测量为 0 的场景（jsdom / 首帧）回落到前 FALLBACK_ROWS 行，保证内容始终可见。
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
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // 列表相对文档顶部的偏移：窗口虚拟化需要它来对齐 start 计算
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    setScrollMargin((prev) => (Math.abs(prev - top) > 1 ? top : prev));
  }, [nodes.length]);

  const virtualizer = useWindowVirtualizer({
    count: nodes.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    scrollMargin,
  });

  // 键盘焦点行滚动进可视区
  useEffect(() => {
    if (focusIndex < 0) return;
    if (typeof window === "undefined" || typeof window.scrollTo !== "function") return;
    virtualizer.scrollToIndex(focusIndex);
  }, [focusIndex, virtualizer]);

  const items = virtualizer.getVirtualItems();
  const FALLBACK_ROWS = 30;

  // 首帧/无测量环境：直接渲染前若干行（虚拟化延迟到有真实测量后再生效）
  if (items.length === 0) {
    return (
      <div ref={listRef} data-testid="file-virtual">
        <div className="relative w-full" style={{ height: nodes.length * ROW_HEIGHT }}>
          {nodes.slice(0, FALLBACK_ROWS).map((n, i) => (
            <Fragment key={n.id}>{row(n, i, i * ROW_HEIGHT)}</Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={listRef} data-testid="file-virtual">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((vi) => {
          const n = nodes[vi.index];
          return (
            <Fragment key={n.id}>{row(n, vi.index, vi.start - scrollMargin)}</Fragment>
          );
        })}
      </div>
    </div>
  );
}
