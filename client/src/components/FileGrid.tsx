import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEventHandler,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";
import type { Node } from "../api/types";
import { contentUrl } from "../api/nodes";
import { thumbUrl } from "../api/thumbs";
import { FileCard } from "./FileCard";

interface Props {
  nodes: Node[];
  containerRef?: RefObject<HTMLDivElement | null>;
  onContainerKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  /** 卡片的类名与行内样式由容器计算（选择高亮、拖拽悬停、入场动画） */
  cellClass: (index: number, node: Node) => string;
  cellStyle: (index: number, node: Node) => CSSProperties;
  onClick: (node: Node, index: number) => (e: ReactMouseEvent) => void;
  onDoubleClick: (node: Node, index: number) => (e: ReactMouseEvent) => void;
  /** 卡片的非点击事件（右键 / 长按选择 / 拖拽 / 放置），由容器统一构造 */
  cellHandlers?: (node: Node, index: number) => HTMLAttributes<HTMLElement>;
  /** 左上角浮层（多选 checkbox） */
  overlay?: (node: Node) => ReactNode;
  badge?: (node: Node) => ReactNode;
  /** 右上角操作组（下载/分享/重命名…） */
  actions?: (node: Node) => ReactNode;
}

/**
 * 网格视图：同一份数据，缩略区 + 名称/大小 + 操作组；滚动由自身承担（视口内滚动契约）。
 * 卡片上的右键/长按/拖拽等交互全部来自 `cellHandlers`，保证与列表视图共用一套行契约。
 */
export function FileGrid({
  nodes,
  containerRef,
  onContainerKeyDown,
  cellClass,
  cellStyle,
  onClick,
  onDoubleClick,
  cellHandlers,
  overlay,
  badge,
  actions,
}: Props) {
  return (
    <div
      ref={containerRef}
      data-testid="file-grid"
      tabIndex={0}
      onKeyDown={onContainerKeyDown}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 md:min-h-0 md:flex-1 md:overflow-y-auto"
    >
      {nodes.map((n, i) => {
        const isImage = !n.is_dir && !!n.mime?.startsWith("image/");
        return (
          <div
            key={n.id}
            data-file-row={i}
            tabIndex={-1}
            className={cellClass(i, n)}
            style={cellStyle(i, n)}
            onClick={onClick(n, i)}
            onDoubleClick={onDoubleClick(n, i)}
            {...cellHandlers?.(n, i)}
          >
            {overlay?.(n)}
            <FileCard
              node={n}
              thumbSrc={n.is_dir ? null : n.thumb_key ? thumbUrl(n.id) : isImage ? contentUrl(n.id) : null}
              badge={badge?.(n)}
              actions={actions?.(n)}
            />
          </div>
        );
      })}
    </div>
  );
}
