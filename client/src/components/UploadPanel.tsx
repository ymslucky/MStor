import type { useUploadQueue } from "../hooks/useUploadQueue";
import { formatBytes } from "../lib/format";

type Queue = ReturnType<typeof useUploadQueue>;

export default function UploadPanel({ queue }: { queue: Queue }) {
  if (!queue.items.length) return null;
  const active = queue.items.filter((i) => i.status === "pending" || i.status === "uploading").length;
  return (
    <div className="fixed right-4 bottom-4 z-30 w-72 rounded-lg border bg-white p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>上传{active > 0 ? `（${active} 个进行中）` : ""}</span>
        <button className="hover:underline" onClick={queue.clearFinished}>清空已完成</button>
      </div>
      <ul className="max-h-60 space-y-2 overflow-auto">
        {queue.items.map((it) => (
          <li key={it.key} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate" title={it.name}>{it.name}</span>
              <span className="shrink-0 text-slate-400">{formatBytes(it.size)}</span>
            </div>
            {it.status === "uploading" && (
              <div className="mt-1 h-1 rounded bg-slate-200">
                <div className="h-1 rounded bg-blue-500" style={{ width: `${Math.round(it.progress * 100)}%` }} />
              </div>
            )}
            {it.status === "done" && <div className="mt-1 text-green-600">完成</div>}
            {it.status === "error" && (
              <div className="mt-1 flex items-center justify-between text-red-600">
                <span className="truncate" title={it.error}>{it.error}</span>
                <button className="shrink-0 underline" onClick={() => queue.retry(it.key)}>重试</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
