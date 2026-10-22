import { useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { toast } from "../components/Toaster";
import { hasNodeDrag } from "../lib/dnd";
import { collectUploads } from "../lib/dirscan";
import type { PendingUpload } from "../lib/dirscan";

/**
 * 拖拽上传：dragenter/leave 计数法防子元素闪烁，drop 时递归采集目录与文件。
 * 从 Browser 页面抽出——页面只挂一份事件处理器 + 一个覆盖层，DnD 细节可单独演进。
 */
export function useDropUpload({ enqueue }: { enqueue: (items: PendingUpload[]) => void }) {
  const [dragDepth, setDragDepth] = useState(0);

  const onDragEnter = (e: ReactDragEvent<HTMLElement>) => {
    e.preventDefault();
    // 内部节点拖拽由行/面包屑的 onDropMove 处理，不能触发上传覆盖层/上传队列
    if (hasNodeDrag(e.dataTransfer)) return;
    setDragDepth((d) => d + 1);
  };
  const onDragOver = (e: ReactDragEvent<HTMLElement>) => {
    if (!hasNodeDrag(e.dataTransfer)) e.preventDefault();
  };
  const onDragLeave = () => setDragDepth((d) => Math.max(0, d - 1));
  const onDrop = (e: ReactDragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragDepth(0);
    const dt = e.dataTransfer;
    if (hasNodeDrag(dt)) return;
    const hasItems = !!dt && ((dt.items?.length ?? 0) > 0 || (dt.files?.length ?? 0) > 0);
    // 目录树递归采集（含文件与文件夹混合拖入），入队后由队列逐级建目录
    void collectUploads(dt)
      .then((items) => {
        if (items.length) enqueue(items);
        else if (hasItems) toast("未发现可上传的文件（空文件夹不会产生上传项）", "info");
      })
      .catch(() => toast("读取拖入内容失败"));
  };

  return {
    /** 拖拽覆盖层是否显示 */
    showOverlay: dragDepth > 0,
    /** 挂到页面根节点的事件处理器 */
    dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
