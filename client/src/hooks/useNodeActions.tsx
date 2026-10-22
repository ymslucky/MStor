import { Copy, Download, ExternalLink, FolderInput, Info, Pencil, Share2, Tag, Trash2 } from "lucide-react";
import type { Node } from "../api/types";
import { contentUrl } from "../api/nodes";
import type { ContextMenuItem } from "../components/ContextMenu";
import { toast } from "../components/Toaster";

interface Handlers {
  /** 任一动作前先收起菜单 */
  closeMenu: () => void;
  onOpenDir: (id: string) => void;
  onPreview: (node: Node) => void;
  onDownload: (node: Node) => void;
  onShare: (node: Node) => void;
  onRename: (node: Node) => void;
  onMove: (node: Node) => void;
  onCopy: (node: Node) => void;
  onDelete: (node: Node) => void;
  onDetail: (node: Node) => void;
  onTag: (node: Node) => void;
}

/**
 * 节点动作与右键菜单项构造（单一出处）。
 * 菜单、行内按钮、后续的右详情栏与键盘快捷键都从这里取语义，
 * 避免同名动作在多处重复实现、行为分叉。
 */
export function useNodeActions(h: Handlers) {
  return (n: Node): ContextMenuItem[] => [
    {
      label: "打开",
      icon: <ExternalLink size={14} aria-hidden />,
      onClick: () => {
        h.closeMenu();
        if (n.is_dir) h.onOpenDir(n.id);
        else h.onPreview(n);
      },
    },
    ...(n.is_dir
      ? []
      : [
          {
            label: "下载",
            icon: <Download size={14} aria-hidden />,
            onClick: () => {
              h.closeMenu();
              h.onDownload(n);
            },
          },
        ]),
    {
      label: "分享",
      icon: <Share2 size={14} aria-hidden />,
      onClick: () => {
        h.closeMenu();
        h.onShare(n);
      },
    },
    {
      label: "重命名",
      icon: <Pencil size={14} aria-hidden />,
      onClick: () => {
        h.closeMenu();
        h.onRename(n);
      },
    },
    {
      label: "移动",
      icon: <FolderInput size={14} aria-hidden />,
      onClick: () => {
        h.closeMenu();
        h.onMove(n);
      },
    },
    {
      label: "复制到…",
      icon: <Copy size={14} aria-hidden />,
      onClick: () => {
        h.closeMenu();
        h.onCopy(n);
      },
    },
    ...(n.is_dir
      ? []
      : [
          {
            label: "复制链接",
            icon: <Copy size={14} aria-hidden />,
            onClick: () => {
              h.closeMenu();
              const url = new URL(contentUrl(n.id), window.location.origin).href;
              void navigator.clipboard?.writeText(url);
              toast("链接已复制", "info");
            },
          },
        ]),
    {
      label: "标签…",
      icon: <Tag size={14} aria-hidden />,
      onClick: () => {
        h.closeMenu();
        h.onTag(n);
      },
    },
    {
      label: "删除",
      icon: <Trash2 size={14} aria-hidden />,
      danger: true,
      onClick: () => {
        h.closeMenu();
        h.onDelete(n);
      },
    },
    {
      label: "详情",
      icon: <Info size={14} aria-hidden />,
      onClick: () => {
        h.closeMenu();
        h.onDetail(n);
      },
    },
  ];
}
