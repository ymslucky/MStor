import { useEffect, useState } from "react";
import { contentUrl } from "../api/nodes";
import type { Node } from "../api/types";
import { formatBytes } from "../lib/format";
import { previewKind } from "../lib/preview";

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
    <div className="fixed inset-0 z-40 flex flex-col bg-black/70" onClick={onClose}>
      <div className="flex items-center justify-between bg-white px-4 py-2" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="truncate font-medium">{node.name}</div>
          <div className="text-xs text-slate-500">{formatBytes(node.size)}</div>
        </div>
        <div className="flex items-center gap-3">
          <a href={contentUrl(node.id, true)} className="text-sm text-blue-600 hover:underline">下载</a>
          <button aria-label="关闭" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-4" onClick={onClose}>
        <div className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
          {kind === "image" && <img src={contentUrl(node.id)} alt={node.name} className="max-h-[80vh] max-w-full object-contain" />}
          {kind === "video" && <video src={contentUrl(node.id)} controls className="max-h-[80vh] max-w-full" />}
          {kind === "audio" && <audio src={contentUrl(node.id)} controls className="w-80" />}
          {kind === "pdf" && <iframe src={contentUrl(node.id)} title={node.name} className="h-[80vh] w-[80vw] rounded bg-white" />}
          {kind === "text" && (
            <pre className="max-h-[80vh] w-[80vw] overflow-auto rounded bg-white p-4 text-sm">{error ? `加载失败：${error}` : (text ?? "加载中…")}</pre>
          )}
          {kind === "none" && (
            <div className="rounded bg-white px-8 py-12 text-center text-sm text-slate-500">
              该文件类型不支持在线预览，请使用左上角「下载」
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
