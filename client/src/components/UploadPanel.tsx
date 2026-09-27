import type { useUploadQueue } from "../hooks/useUploadQueue";
import { formatBytes } from "../lib/format";

type Queue = ReturnType<typeof useUploadQueue>;

export default function UploadPanel({ queue }: { queue: Queue }) {
  if (!queue.items.length) return null;
  const active = queue.items.filter((i) => i.status === "pending" || i.status === "uploading").length;
  return (
    // G2 玻璃浮动卡片：移动端抬高避开底部导航，sm+ 贴近右下角
    <div className="glass-panel fixed right-4 bottom-20 z-30 w-72 rounded-panel p-3 shadow-glass sm:bottom-4">
      <div className="mb-2 flex items-center justify-between text-xs text-ink-dim">
        <span>上传{active > 0 ? `（${active} 个进行中）` : ""}</span>
        <button className="text-accent hover:underline" onClick={queue.clearFinished}>清空已完成</button>
      </div>
      <ul className="max-h-60 space-y-2 overflow-auto">
        {queue.items.map((it) => (
          <li key={it.key} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-ink" title={it.name}>{it.name}</span>
              <span className="shrink-0 text-ink-faint">{formatBytes(it.size)}</span>
            </div>
            {it.status === "uploading" && (
              <div className="mt-1 h-1 overflow-hidden rounded bg-white/10">
                <div
                  className="h-full rounded bg-gradient-to-r from-sky-400 to-sky-600 transition-[width] duration-150"
                  style={{ width: `${Math.round(it.progress * 100)}%` }}
                />
              </div>
            )}
            {it.status === "done" && <div className="mt-1 text-success">完成</div>}
            {it.status === "error" && (
              <div className="mt-1 flex items-center justify-between text-danger">
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
