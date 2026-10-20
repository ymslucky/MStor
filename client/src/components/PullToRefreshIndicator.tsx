import { Loader2, ArrowDown } from "lucide-react";

/** 下拉刷新指示条：仅在触摸下拉或刷新中显示 */
export function PullToRefreshIndicator({ pull, ready, refreshing }: { pull: number; ready: boolean; refreshing: boolean }) {
  if (pull <= 0 && !refreshing) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pull-to-refresh"
      className="pointer-events-none fixed inset-x-0 top-2 z-overlay flex justify-center md:hidden"
      style={{ opacity: refreshing ? 1 : Math.min(1, pull / 70) }}
    >
      <div className="glass flex items-center gap-1.5 px-3 py-1.5 text-xs text-ink-2">
        {refreshing ? (
          <>
            <Loader2 size={14} aria-hidden className="animate-spin" />
            刷新中…
          </>
        ) : (
          <>
            <ArrowDown size={14} aria-hidden style={{ transform: ready ? "rotate(180deg)" : undefined }} />
            {ready ? "松手刷新" : "下拉刷新"}
          </>
        )}
      </div>
    </div>
  );
}
