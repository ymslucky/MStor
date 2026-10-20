import { FolderInput, Link2, Pencil, Trash2 } from "lucide-react";
import type { Node } from "../api/types";
import { RowAction } from "./FileList";

/** 行内操作组：分享 / 重命名 / 移动 / 删除（菜单、键盘、行内按钮共用同一组语义） */
export function NodeRowActions({
  node,
  onShare,
  onRename,
  onMove,
  onDelete,
}: {
  node: Node;
  onShare: (n: Node) => void;
  onRename: (n: Node) => void;
  onMove: (n: Node) => void;
  onDelete: (n: Node) => void;
}) {
  return (
    <>
      <RowAction label={`分享 ${node.name}`} tone="violet" onClick={() => onShare(node)}>
        <Link2 size={14} aria-hidden />
      </RowAction>
      <RowAction label={`重命名 ${node.name}`} onClick={() => onRename(node)}>
        <Pencil size={14} aria-hidden />
      </RowAction>
      <RowAction label={`移动 ${node.name}`} tone="amber" onClick={() => onMove(node)}>
        <FolderInput size={14} aria-hidden />
      </RowAction>
      <RowAction label={`删除 ${node.name}`} tone="danger" onClick={() => onDelete(node)}>
        <Trash2 size={14} aria-hidden />
      </RowAction>
    </>
  );
}
