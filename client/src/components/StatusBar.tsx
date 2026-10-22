import { useUploadQueueState } from "../hooks/UploadQueueProvider";
import type { Me } from "../api/types";
import { formatBytes } from "../lib/format";

/** 状态栏（三栏骨架）：当前空间 · 用量 · 上传队列 · 未读通知（明亮玻璃细条） */
export function StatusBar({ me }: { me: Me }) {
  const { items } = useUploadQueueState();
  const active = items.filter((i) => i.status === "pending" || i.status === "uploading" || i.status === "paused").length;
  const used = me.storage?.usedBytes ?? me.usedBytes;
  const quota = me.storage?.quotaBytes ?? me.quotaBytes;
  const pct = quota > 0 ? Math.min(999, Math.round((used / quota) * 100)) : 0;
  const level = me.storage?.level ?? "ok";
  const tone =
    level === "full" || level === "critical" ? "text-danger-text" : level === "warn" ? "text-warn-text" : "text-ink-2";

  return (
    <div
      data-testid="status-bar"
      className="hidden h-8 shrink-0 items-center gap-3 border-t border-line bg-surface-1 px-4 md:flex"
    >
      <span className="truncate text-2xs font-medium text-ink-2">{me.workspace?.name ?? "我的空间"}</span>
      <span aria-hidden className="text-2xs text-ink-3">·</span>
      <span className={`num text-2xs ${tone}`} title="已用 / 配额">
        {formatBytes(used)} / {formatBytes(quota)}（{pct}%）
      </span>
      <span aria-hidden className="text-2xs text-ink-3">·</span>
      <span className="num text-2xs text-ink-2">{active > 0 ? `队列 ${active}` : "队列空闲"}</span>
      <span className="ml-auto num text-2xs text-ink-2">
        {(me.unreadNotifications ?? 0) > 0 ? `${me.unreadNotifications} 条未读` : "无未读"}
      </span>
    </div>
  );
}
