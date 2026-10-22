import { CircleAlert, CircleCheck, CloudUpload, Pause, Play, RotateCcw, Trash2, X } from "lucide-react";
import { useUploadQueueActions, useUploadQueueState } from "../hooks/UploadQueueProvider";
import { formatBytes } from "../lib/format";
import { Surface } from "./ui";

/** 单项进度：progress 语义是 0..1 的比例（useUploadQueue 的契约），这里只做展示换算 */
const itemPercent = (progress: number) => Math.max(0, Math.min(100, Math.round(progress * 100)));

/**
 * 全局上传浮层（右下角，AppShell 级）：队列跨路由存活，切到回收站/设置页也能看见进度。
 * 本组件是唯一的上传 UI（原 Browser 内的 UploadPanel 已合并到此），避免两个浮层同位置互相遮挡。
 */
export function GlobalUploadDock() {
  const { items } = useUploadQueueState();
  const { retry, cancel, purge } = useUploadQueueActions();
  // 已完成项不再占用浮层（否则「上传（空闲）」常驻角落）；失败/暂停项保留，便于重试或彻底取消
  const visible = items.filter((i) => i.status !== "done");
  if (visible.length === 0) return null;

  const active = visible.filter((i) => i.status === "pending" || i.status === "uploading" || i.status === "paused");
  // 完成字节 = Σ(size × progress)；progress 是 0..1，不能再去掉 100
  const totalBytes = visible.reduce((sum, i) => sum + i.size, 0);
  const doneBytes = visible.reduce((sum, i) => sum + Math.round(i.size * i.progress), 0);
  const percent = totalBytes > 0 ? Math.round((doneBytes / totalBytes) * 100) : 0;
  // 合计速度：所有 uploading 项 EMA 速度求和
  const totalSpeed = visible.reduce((sum, i) => (i.status === "uploading" && i.speed ? sum + i.speed : sum), 0);

  return (
    <div className="dock-bottom fixed right-4 z-overlay w-72 max-w-[calc(100vw-2rem)]">
      <Surface className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
            <CloudUpload size={14} aria-hidden className="shrink-0 text-primary-text" />
            <span className="truncate">
              上传{active.length > 0 ? `（${active.length} 个进行中）` : ""}
              {totalSpeed > 0 ? ` · ${formatBytes(totalSpeed)}/s` : ""}
            </span>
          </span>
        </div>

        <div className="h-1 w-full bg-primary-soft" aria-hidden>
          <div className="h-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${percent}%` }} />
        </div>

        <ul className="max-h-64 divide-y divide-line overflow-auto">
          {visible.map((it) => (
            <li key={it.key} className="px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                {/* 嵌套上传显示相对路径（含目录），title 兜底悬停全文 */}
                <span className="truncate text-ink" title={it.path ?? it.name}>
                  {it.path ?? it.name}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {it.status === "uploading" && it.speed != null && it.speed > 0 && (
                    <span className="tabular-nums text-primary-text">{formatBytes(it.speed)}/s</span>
                  )}
                  <span className="text-ink-3">{formatBytes(it.size)}</span>
                  {(it.status === "pending" || it.status === "uploading") && (
                    <button
                      type="button"
                      aria-label={it.fingerprint ? `暂停 ${it.name}` : `取消 ${it.name}`}
                      title={it.fingerprint ? "暂停（保留进度，可续传）" : "取消"}
                      className="text-ink-3 transition-colors hover:text-danger-text"
                      onClick={() => cancel(it.key)}
                    >
                      {it.fingerprint ? <Pause size={14} aria-hidden /> : <X size={14} aria-hidden />}
                    </button>
                  )}
                </span>
              </div>

              {(it.status === "uploading" || it.status === "paused") && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-sub">
                  <div
                    className={it.status === "paused" ? "h-full rounded-full bg-line-strong" : "h-full rounded-full bg-primary transition-[width] duration-200 ease-out"}
                    style={{ width: `${itemPercent(it.progress)}%` }}
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
                    <button type="button" className="flex items-center gap-0.5 underline" onClick={() => retry(it.key)}>
                      <Play size={11} aria-hidden />
                      继续
                    </button>
                    <button
                      type="button"
                      aria-label={`彻底取消 ${it.name}`}
                      title="彻底取消（清理服务端分片）"
                      className="transition-colors hover:text-danger-text"
                      onClick={() => purge(it.key)}
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
                    <span className="truncate" title={it.error}>
                      {it.error}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button type="button" className="flex items-center gap-0.5 underline" onClick={() => retry(it.key)}>
                      <RotateCcw size={11} aria-hidden />
                      重试
                    </button>
                    {it.fingerprint && (
                      <button
                        type="button"
                        aria-label={`彻底取消 ${it.name}`}
                        title="彻底取消（清理服务端分片）"
                        className="transition-colors hover:text-danger-text"
                        onClick={() => purge(it.key)}
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
      </Surface>
    </div>
  );
}
