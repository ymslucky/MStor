import { Download, FolderInput, Link2, Pencil, Tag, Trash2, X } from "lucide-react";
import { contentUrl } from "../api/nodes";
import type { Node } from "../api/types";
import { formatBytes, formatDate } from "../lib/format";
import { NodeIcon } from "./NodeIcon";
import { Button, IconButton, Surface } from "./ui";

interface Props {
  node: Node;
  onClose: () => void;
  onDownload: (n: Node) => void;
  onShare: (n: Node) => void;
  onRename: (n: Node) => void;
  onMove: (n: Node) => void;
  onDelete: (n: Node) => void;
  onTag?: (n: Node) => void;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-3 py-1.5">
    <span className="shrink-0 text-xs text-ink-3">{label}</span>
    <span className="min-w-0 truncate text-right text-xs text-ink" title={value}>
      {value}
    </span>
  </div>
);

/**
 * 右详情栏（三栏骨架的第三栏）：作为布局中的一列参与排版（不再 fixed 浮层）。
 * 是否渲染由页面用 useMediaQuery 决定——一个 detail 状态只对应一个界面，不用 CSS 隐藏兜底。
 */
export function DetailPane({ node, onClose, onDownload, onShare, onRename, onMove, onDelete, onTag }: Props) {
  return (
    <aside data-testid="detail-pane" aria-label="详情" className="w-72 shrink-0 self-stretch xl:w-80">
      <Surface className="flex h-full flex-col p-4">
      <div className="flex items-start gap-2">
        <NodeIcon node={node} size={28} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink" title={node.name}>
            {node.name}
          </p>
          <p className="text-xs text-ink-3">{node.is_dir ? "文件夹" : "文件"}</p>
        </div>
        <IconButton label="关闭详情" onClick={onClose}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>

      {node.mime?.startsWith("image/") && (
        <img
          src={contentUrl(node.id, true)}
          alt={`${node.name} 预览`}
          loading="lazy"
          className="mt-3 aspect-[4/3] w-full rounded-md border border-line bg-bg-sub object-cover"
        />
      )}

      <div className="mt-3 border-t border-line pt-2">
        {!node.is_dir && <Row label="大小" value={formatBytes(node.size)} />}
        <Row label="修改时间" value={formatDate(node.updated_at)} />
        <Row label="创建时间" value={formatDate(node.created_at)} />
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5 border-t border-line pt-3">
        {!node.is_dir && (
          <Button size="sm" variant="ghost" onClick={() => onDownload(node)}>
            <Download size={14} aria-hidden />
            下载
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onShare(node)}>
          <Link2 size={14} aria-hidden />
          分享
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onRename(node)}>
          <Pencil size={14} aria-hidden />
          重命名
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onMove(node)}>
          <FolderInput size={14} aria-hidden />
          移动
        </Button>
        {onTag && (
          <Button size="sm" variant="ghost" onClick={() => onTag(node)}>
            <Tag size={14} aria-hidden />
            标签
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={() => onDelete(node)}>
          <Trash2 size={14} aria-hidden />
          删除
        </Button>
      </div>
      </Surface>
    </aside>
  );
}
