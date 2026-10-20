import { useState } from "react";
import { ChevronUp, Pause, RotateCw, X } from "lucide-react";
import { useUploadQueueContext } from "../hooks/UploadQueueProvider";
import { formatBytes } from "../lib/format";

/**
 * 全局上传浮层（浏览器右下角）：队列在 AppShell 级，所以切到回收站/设置页也能看见进度。
 * 只展示 active（pending/uploading/paused）项，完成后自动隐藏，不打扰。
 */
export function GlobalUploadDock() {
  const { items, retry, cancel, purge } = useUploadQueueContext();
  const [open, setOpen] = useState(false);
  const active = items.filter((i) => i.status === "pending" || i.status === "uploading" || i.status === "paused");
  if (active.length === 0) return null;
  const totalBytes = active.reduce((sum, i) => sum + i.size, 0);
  const doneBytes = active.reduce((sum, i) => sum + Math.round((i.size * i.progress) / 100), 0);
  const percent = totalBytes > 0 ? Math.round((doneBytes / totalBytes) * 100) : 0;

  return (
    <div className="fixed bottom-20 right-4 z-overlay w-72 md:bottom-4" role="status" aria-live="polite">
      <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "收起上传详情" : "展开上传详情"}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-ink">正在上传 {active.length} 个文件</span>
            <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-primary-soft">
              <span className="block h-full bg-primary transition-[width]" style={{ width: percent + "%" }} />
            </span>
          </span>
          <span className="shrink-0 text-xs text-ink-3">{percent}%</span>
          <ChevronUp size={14} aria-hidden className={"shrink-0 text-ink-3 transition-transform " + (open ? "" : "rotate-180")} />
        </button>
        {open && (
          <ul className="max-h-64 divide-y divide-line overflow-auto border-t border-line">
            {active.map((it) => (
              <li key={it.key} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-ink" title={it.path ? it.path + "/" + it.name : it.name}>
                    {it.name}
                  </span>
                  <span className="text-[11px] text-ink-3">
                    {it.status === "paused" ? "已暂停" : it.status === "pending" ? "排队中" : percent + "%"} · {formatBytes(it.size)}
                  </span>
                </span>
                {it.status === "paused" ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-lg p-1.5 text-ink-2 hover:bg-primary-soft"
                    aria-label={"重试 " + it.name}
                    onClick={() => retry(it.key)}
                  >
                    <RotateCw size={14} aria-hidden />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="shrink-0 rounded-lg p-1.5 text-ink-2 hover:bg-primary-soft"
                    aria-label={"暂停 " + it.name}
                    onClick={() => cancel(it.key)}
                  >
                    <Pause size={14} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-1.5 text-danger hover:bg-danger-soft"
                  aria-label={"取消 " + it.name}
                  onClick={() => purge(it.key)}
                >
                  <X size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
