import type { ReactNode } from "react";
import type { Node } from "../api/types";
import { FILE_COLUMNS } from "../hooks/useFileTable";
import type { FileTableRow } from "../hooks/useFileTable";
import { formatBytes, formatDate, truncateMiddle } from "../lib/format";
import { NodeIcon } from "./NodeIcon";

interface Props {
  /** 行模型：节点取 row.original，列显隐取 row 的可见列 */
  row: FileTableRow;
  selectable: boolean;
  /** 容器渲染的 checkbox（保持行内点击不冒泡的处理在容器里） */
  checkboxEl?: ReactNode;
  /** 容器渲染的「复制文件名」按钮（沿用容器里的 RowAction 样式） */
  copyButton?: ReactNode;
  /** 已分享等角标 */
  badge?: ReactNode;
  /** 容器渲染的操作列（下载 + 外部 actions） */
  actionCell: ReactNode;
}

/**
 * 列表/虚拟列表共用的行内容（纯布局）：三处渲染路径（表头对齐的 grid 行、虚拟行）
 * 都渲染这一份，容器只负责行容器、拖拽、选择与虚拟化。
 * 大小/时间列是否出现取自行模型的可见列，与表头列显隐同源。
 */
export function FileRowCells({ row, selectable, checkboxEl, copyButton, badge, actionCell }: Props) {
  const node: Node = row.original;
  const visible = new Set(row.getVisibleCells().map((cell) => cell.column.id));
  const showSize = visible.has(FILE_COLUMNS.size);
  const showTime = visible.has(FILE_COLUMNS.time);

  return (
    <>
      {selectable && <span className="px-1 text-center">{checkboxEl}</span>}
      <span className="flex justify-center">
        <NodeIcon node={node} size={18} className="shrink-0" />
      </span>
      <span className="flex min-w-0 items-center gap-1">
        {/* 点击事件由行容器统一处理（避免冒泡双重 toggle），按钮仅承担样式与 title */}
        <button
          type="button"
          className="min-w-0 truncate text-left text-ink hover:underline"
          title={node.name}
          tabIndex={-1}
        >
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
