import { CircleAlert, CircleCheck, CloudUpload, Pause, Play, RotateCcw, Trash2, X } from "lucide-react";
import type { useUploadQueue } from "../hooks/useUploadQueue";
import { formatBytes } from "../lib/format";

type Queue = ReturnType<typeof useUploadQueue>;

export default function UploadPanel({ queue }: { queue: Queue }) {
  if (!queue.items.length) return null;
  const active = queue.items.filter((i) => i.status === "pending" || i.status === "uploading").length;
  // 合计速度：所有 uploading 项 EMA 速度求和
  const totalSpeed = queue.items.reduce((sum, i) => (i.status === "uploading" && i.speed ? sum + i.speed : sum), 0);
  return (
    // 玻璃悬浮条（glass-light blur12）：移动端抬高避开底部导航，sm+ 贴近右下角；
    // 底部 padding 兼容 iOS safe-area（横屏 Home 条）
    <div className="glass-light fixed right-4 bottom-20 z-30 w-72 rounded-panel shadow-glass pb-[env(safe-area-inset-bottom)] sm:bottom-4">
      <div className="mb-2 flex items-center justify-between px-3 pt-3 text-xs text-ink-2">
        <span className="flex items-center gap-1.5">
          <CloudUpload size={14} aria-hidden className="text-primary-text" />
          上传（{active > 0 ? `${active} 个进行中` : ""}
          {totalSpeed > 0 ? ` · ${formatBytes(totalSpeed)}/s` : ""}）
        </span>
        <button className="text-primary-text hover:underline" onClick={queue.clearFinished}>清空已完成</button>
      </div>
      <ul aria-live="polite" className="max-h-60 space-y-2 overflow-auto px-3 pb-3">
        {queue.items.map((it) => (
          <li key={it.key} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              {/* 嵌套上传显示相对路径（含目录），title 兜底悬停全文 */}
              <span className="truncate text-ink" title={it.path ?? it.name}>{it.path ?? it.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                {it.status === "uploading" && it.speed != null && it.speed > 0 && (
                  <span className="tabular-nums text-primary-text">{formatBytes(it.speed)}/s</span>
                )}
                <span className="text-ink-3">{formatBytes(it.size)}</span>
                {/* 大文件「暂停」保留服务端分片可续传；小文件仍是取消 */}
                {(it.status === "pending" || it.status === "uploading") && (
                  <button
                    aria-label={it.fingerprint ? `暂停 ${it.name}` : `取消 ${it.name}`}
                    title={it.fingerprint ? "暂停（保留进度，可续传）" : "取消"}
                    className="text-ink-3 transition-colors hover:text-danger-text"
                    onClick={() => queue.cancel(it.key)}
                  >
                    {it.fingerprint ? <Pause size={14} aria-hidden /> : <X size={14} aria-hidden />}
                  </button>
                )}
              </span>
            </div>
            {(it.status === "uploading" || it.status === "paused") && (
              <div className="mt-1 h-1 overflow-hidden rounded bg-gray-100">
                <div
                  className={it.status === "paused" ? "h-full rounded bg-gray-300" : "h-full rounded bg-primary transition-[width] duration-200 ease-out"}
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
            {it.status === "paused" && (
              <div className="mt-1 flex items-center justify-between gap-1 text-ink-2">
                <span className="flex items-center gap-1">
                  <Pause size={12} aria-hidden />
                  已暂停（保留进度）
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <button className="flex items-center gap-0.5 underline" onClick={() => queue.retry(it.key)}>
                    <Play size={11} aria-hidden />
                    继续
                  </button>
                  <button
                    aria-label={`彻底取消 ${it.name}`}
                    title="彻底取消（清理服务端分片）"
                    className="transition-colors hover:text-danger-text"
                    onClick={() => queue.purge(it.key)}
                  >
                    <Trash2 size={11} aria-hidden />
                  </button>
                </span>
              </div>
            )}
            {it.status === "error" && (
              <div className="mt-1 flex items-center justify-between gap-1 text-danger-text">
                <span className="flex min-w-0 items-center gap-1">
                  <CircleAlert size={12} aria-hidden className="shrink-0" />
                  <span className="truncate" title={it.error}>{it.error}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <button className="flex items-center gap-0.5 underline" onClick={() => queue.retry(it.key)}>
                    <RotateCcw size={11} aria-hidden />
                    重试
                  </button>
                  {/* 大文件失败保留了服务端分片，提供彻底取消入口 */}
                  {it.fingerprint && (
                    <button
                      aria-label={`彻底取消 ${it.name}`}
                      title="彻底取消（清理服务端分片）"
                      className="transition-colors hover:text-danger-text"
                      onClick={() => queue.purge(it.key)}
                    >
                      <Trash2 size={11} aria-hidden />
                    </button>
                  )}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
