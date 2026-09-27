import { useEffect, useState } from "react";
import { contentUrl } from "../api/nodes";
import type { Node } from "../api/types";
import { formatBytes } from "../lib/format";
import { previewKind } from "../lib/preview";
import { IconButton } from "./ui";

interface Props {
  node: Node;
  onClose: () => void;
}

// spec §7.2：文本截断前 1MB（后端支持 Range）
async function fetchTextHead(id: string): Promise<string> {
  const res = await fetch(contentUrl(id), { headers: { range: "bytes=0-1048575" } });
  if (!res.ok && res.status !== 206) throw new Error("加载失败");
  return res.text();
}

// 下载保持 <a>（下载语义 + href 断言），仅图标化并复用 IconButton 视觉规格
const iconAction =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink-dim transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent";

export default function PreviewModal({ node, onClose }: Props) {
  const kind = previewKind(node.mime);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (kind !== "text") return;
    fetchTextHead(node.id).then(setText).catch((e: Error) => setError(e.message));
  }, [kind, node.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black/70 p-2 sm:p-4" onClick={onClose}>
      {/* 预览面板：glass-modal 层（当前打开的弹层，占用一个模糊预算） */}
      <div className="glass-modal flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel" onClick={onClose}>
        {/* 头部信息条：白面板顶栏，媒体内容不透出 */}
        <div
          className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 sm:px-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{node.name}</div>
            <div className="text-xs text-ink-dim">{formatBytes(node.size)}</div>
          </div>
          <div className="flex items-center gap-1">
            <a href={contentUrl(node.id, true)} aria-label="下载" title="下载" className={iconAction}>
              <span aria-hidden>⬇️</span>
            </a>
            <IconButton label="关闭" onClick={onClose}>
              <span aria-hidden>✕</span>
            </IconButton>
          </div>
        </div>
        {/* 媒体区：移动端 padding 减半 */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-4">
          <div className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            {kind === "image" && <img src={contentUrl(node.id)} alt={node.name} className="max-h-[80vh] max-w-full object-contain" />}
            {kind === "video" && <video src={contentUrl(node.id)} controls className="max-h-[80vh] w-full" />}
            {kind === "audio" && <audio src={contentUrl(node.id)} controls className="w-80" />}
            {kind === "pdf" && <iframe src={contentUrl(node.id)} title={node.name} className="h-[80vh] w-[80vw] rounded bg-white" />}
            {kind === "text" && (
              <pre className="max-h-[80vh] w-[80vw] overflow-auto rounded-xl border border-line bg-gray-50 p-4 text-sm text-ink">{error ? `加载失败：${error}` : (text ?? "加载中…")}</pre>
            )}
            {kind === "none" && (
              <div className="rounded-xl border border-line bg-gray-50 px-8 py-12 text-center text-sm text-ink-dim">
                该文件类型不支持在线预览，请使用右上角「下载」
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
