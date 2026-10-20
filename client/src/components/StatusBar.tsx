import { useUploadQueueContext } from "../hooks/UploadQueueProvider";
import type { Me } from "../api/types";
import { formatBytes } from "../lib/format";

/**
 * 状态栏（v5 三栏骨架的第一块）：常驻显示当前空间、用量、上传队列与未读通知。
 * 桌面贴在内容列底部；移动端让位给底部导航。
 */
export function StatusBar({ me }: { me: Me }) {
  const { items } = useUploadQueueContext();
  const active = items.filter((i) => i.status === "pending" || i.status === "uploading" || i.status === "paused").length;
  const used = me.storage?.usedBytes ?? me.usedBytes;
  const quota = me.storage?.quotaBytes ?? me.quotaBytes;
  const pct = quota > 0 ? Math.min(999, Math.round((used / quota) * 100)) : 0;
  const level = me.storage?.level ?? "ok";

  const tone =
    level === "full" ? "text-danger-text" : level === "critical" ? "text-danger-text" : level === "warn" ? "text-warn-text" : "text-ink-2";

  return (
    <div
      data-testid="status-bar"
      className="hidden shrink-0 items-center gap-4 border-t border-line-strong bg-surface-2 px-4 py-1.5 md:flex"
    >
      <span className="label-mono truncate">{me.workspace?.name ?? "我的空间"}</span>
      <span className="h-3 w-px bg-line" aria-hidden />
      <span className={`num text-2xs ${tone}`} title="已用 / 配额">
        {formatBytes(used)} / {formatBytes(quota)}（{pct}%）
      </span>
      <span className="h-3 w-px bg-line" aria-hidden />
      <span className="num text-2xs text-ink-2">
        {active > 0 ? `队列 ${active} 进行中` : "队列空闲"}
      </span>
      <span className="ml-auto h-3 w-px bg-line" aria-hidden />
      <span className="num text-2xs text-ink-2">
        {(me.unreadNotifications ?? 0) > 0 ? `${me.unreadNotifications} 条未读` : "无未读"}
      </span>
    </div>
  );
}
