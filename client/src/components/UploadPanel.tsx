import { CircleAlert, CircleCheck, CloudUpload, RotateCcw, X } from "lucide-react";
import type { useUploadQueue } from "../hooks/useUploadQueue";
import { formatBytes } from "../lib/format";

type Queue = ReturnType<typeof useUploadQueue>;

export default function UploadPanel({ queue }: { queue: Queue }) {
  if (!queue.items.length) return null;
  const active = queue.items.filter((i) => i.status === "pending" || i.status === "uploading").length;
  return (
    // 玻璃悬浮条（glass-light blur12）：移动端抬高避开底部导航，sm+ 贴近右下角
    <div className="glass-light fixed right-4 bottom-20 z-30 w-72 rounded-panel shadow-glass sm:bottom-4">
      <div className="mb-2 flex items-center justify-between px-3 pt-3 text-xs text-ink-2">
        <span className="flex items-center gap-1.5">
          <CloudUpload size={14} aria-hidden className="text-primary-text" />
          上传{active > 0 ? `（${active} 个进行中）` : ""}
        </span>
        <button className="text-primary-text hover:underline" onClick={queue.clearFinished}>清空已完成</button>
      </div>
      <ul aria-live="polite" className="max-h-60 space-y-2 overflow-auto px-3 pb-3">
        {queue.items.map((it) => (
          <li key={it.key} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-ink" title={it.name}>{it.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="text-ink-3">{formatBytes(it.size)}</span>
                {/* 「暂停」= 中止该项（续传需后端，备案）：文案用「取消」 */}
                {(it.status === "pending" || it.status === "uploading") && (
                  <button
                    aria-label={`取消 ${it.name}`}
                    title="取消"
                    className="text-ink-3 transition-colors hover:text-danger-text"
                    onClick={() => queue.cancel(it.key)}
                  >
                    <X size={14} aria-hidden />
                  </button>
                )}
              </span>
            </div>
            {it.status === "uploading" && (
              <div className="mt-1 h-1 overflow-hidden rounded bg-gray-100">
                <div
                  className="h-full rounded bg-primary transition-[width] duration-200 ease-out"
                  style={{ width: `${Math.round(it.progress * 100)}%` }}
                />
              </div>
            )}
            {it.status === "done" && (
              <div className="mt-1 flex items-center gap-1 text-success-text">
                <CircleCheck size={12} aria-hidden />
                完成
              </div>
            )}
            {it.status === "error" && (
              <div className="mt-1 flex items-center justify-between gap-1 text-danger-text">
                <span className="flex min-w-0 items-center gap-1">
                  <CircleAlert size={12} aria-hidden className="shrink-0" />
                  <span className="truncate" title={it.error}>{it.error}</span>
                </span>
                <button
                  className="flex shrink-0 items-center gap-0.5 underline"
                  onClick={() => queue.retry(it.key)}
                >
                  <RotateCcw size={11} aria-hidden />
                  重试
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
