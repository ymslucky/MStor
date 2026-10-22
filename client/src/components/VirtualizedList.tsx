import { Fragment, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Node } from "../api/types";
import { VIRTUAL_FALLBACK_ROWS } from "../lib/constants";

/** 行高兜底值（与 --density-row-h 默认一致；无 CSS 环境按此回退） */
const FALLBACK_ROW_HEIGHT = 48;

/**
 * 行高来自密度令牌 --density-row-h（comfortable 48 / compact 40）。
 * 组件在渲染期读取，切换密度后重新挂载即生效；jsdom 读不到时回落 48。
 */
export function getRowHeight(): number {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") return FALLBACK_ROW_HEIGHT;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--density-row-h").trim();
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) && px > 0 ? px : FALLBACK_ROW_HEIGHT;
}


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
  const rowHeight = getRowHeight();
  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  useEffect(() => {
    if (focusIndex < 0) return;
    const el = scrollRef.current;
    if (!el || typeof el.scrollTo !== "function") return;
    virtualizer.scrollToIndex(focusIndex);
  }, [focusIndex, virtualizer]);

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      data-testid="file-virtual"
      className="md:min-h-0 md:flex-1 md:overflow-y-auto"
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() || nodes.length * rowHeight }}>
        {items.length === 0
          ? nodes.slice(0, VIRTUAL_FALLBACK_ROWS).map((n, i) => <Fragment key={n.id}>{row(n, i, i * rowHeight)}</Fragment>)
          : items.map((vi) => {
              const n = nodes[vi.index];
              return <Fragment key={n.id}>{row(n, vi.index, vi.start)}</Fragment>;
            })}
      </div>
    </div>
  );
}
