import type { ReactNode } from "react";
import type { Node } from "../api/types";
import { formatBytes, formatDate, truncateMiddle } from "../lib/format";
import { NodeIcon } from "./NodeIcon";

interface Props {
  node: Node;
  selectable: boolean;
  /** 容器渲染的 checkbox（保持行内点击不冒泡的处理在容器里） */
  checkboxEl?: ReactNode;
  /** 容器渲染的「复制文件名」按钮（沿用容器里的 RowAction 样式） */
  copyButton?: ReactNode;
  /** 已分享等角标 */
  badge?: ReactNode;
  /** 容器渲染的操作列（下载 + 外部 actions） */
  actionCell: ReactNode;
  showSize: boolean;
  showTime: boolean;
}

/**
 * 列表/虚拟列表共用的行内容（纯布局）：三处渲染路径（表头对齐的 grid 行、虚拟行）
 * 都渲染这一份，容器只负责行容器、拖拽、选择与虚拟化。
 */
export function FileRowCells({ node, selectable, checkboxEl, copyButton, badge, actionCell, showSize, showTime }: Props) {
  return (
    <>
      {selectable && <span className="px-1 text-center">{checkboxEl}</span>}
      <span className="flex justify-center">
        <NodeIcon node={node} size={18} className="shrink-0" />
      </span>
      <span className="flex min-w-0 items-center gap-1">
        {/* 点击事件由行容器统一处理（避免冒泡双重 toggle），按钮仅承担样式与 title */}
        <button type="button" className="min-w-0 truncate text-left text-ink hover:underline" title={node.name} tabIndex={-1}>
          {truncateMiddle(node.name)}
        </button>
        {copyButton}
        {badge}
      </span>
      {showSize && <span className="truncate px-2 text-right tabular-nums text-ink-dim">{formatBytes(node.size)}</span>}
      {showTime && <span className="truncate px-2 tabular-nums text-ink-dim">{formatDate(node.updated_at)}</span>}
      {actionCell}
    </>
  );
}
