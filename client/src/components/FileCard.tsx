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
  /** 左上角浮层（多选 checkbox） */
  overlay?: ReactNode;
}

/**
 * 网格视图的单张卡片（纯展示）：交互与拖拽/选择由 FileList 的容器负责，
 * 这里只关心「缩略图区 + 名称/大小」的排版，便于将来在时间线/相册视图复用。
 */
export function FileCard({ node, thumbSrc, badge, overlay }: Props) {
  return (
    <>
      {overlay}
      <button type="button" className="block w-full text-left" title={node.name}>
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
        <div className="p-2">
          <div className="flex items-center gap-1.5">
            <NodeIcon node={node} size={14} className="shrink-0" />
            <span className="truncate text-sm text-ink">{truncateMiddle(node.name, 20)}</span>
            {badge}
          </div>
          <div className="text-xs tabular-nums text-ink-faint">{formatBytes(node.size)}</div>
        </div>
      </button>
    </>
  );
}
