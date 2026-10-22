import type { ReactNode } from "react";
import type { Node } from "../api/types";
import { formatBytes, truncateMiddle } from "../lib/format";
import { NodeIcon } from "./NodeIcon";

interface Props {
  node: Node;
  /** 卡片缩略图地址：有服务端缩略图用缩略图，否则图片回落到原图，非图片用图标 */
  thumbSrc: string | null;
  /** 「已分享」等角标 */
  badge?: ReactNode;
  /** 右上角操作组（网格视图的操作入口；悬停/聚焦出现，触屏常显） */
  actions?: ReactNode;
}

/**
 * 网格视图的单张卡片（纯展示）：交互与拖拽/选择由 FileList 的容器负责，
 * 这里只关心「缩略图区 + 名称/大小 + 操作组」的排版。
 * 注意：卡片本身不提供 tab 停靠点（整卡由容器的 roving focus 承担），
 * 否则每个文件都会在 Tab 序列里多出一个无动作的按钮。
 */
export function FileCard({ node, thumbSrc, badge, actions }: Props) {
  return (
    <>
      <div className="block w-full text-left" title={node.name}>
        <div className="flex h-28 items-center justify-center overflow-hidden bg-bg-sub">
          {thumbSrc ? (
            <img
              src={thumbSrc}
              alt={node.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <NodeIcon node={node} size={44} className="text-ink-3" />
          )}
        </div>
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <NodeIcon node={node} size={14} className="shrink-0" />
            <span className="truncate text-sm text-ink">{truncateMiddle(node.name, 20)}</span>
            {badge}
          </div>
          <div className="text-xs tabular-nums text-ink-faint">
            {node.is_dir ? "文件夹" : formatBytes(node.size)}
          </div>
        </div>
      </div>
      {actions && (
        <div
          // md 是宽度断点而非 hover 能力：iPad/触屏笔记本同样 ≥md，必须用 (hover:none) 兜底常显
          className="grid-card-actions absolute top-1.5 right-1.5 z-content flex items-center gap-0.5 rounded-lg border border-line bg-surface-1/95 px-1 py-0.5 shadow-soft transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </>
  );
}
