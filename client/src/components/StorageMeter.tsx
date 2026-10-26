import { formatBytes } from "../lib/format";

// 侧栏存储用量表：SVG 环形图（primary 环，>90% 转 warn）+ tabular-nums 用量文字 + R2 免出口流量注记
// compact（命令轨）只渲染环形图，用量保留屏幕阅读器文本与悬停提示
export default function StorageMeter({
  usedBytes,
  quotaBytes,
  compact = false,
}: {
  usedBytes: number;
  quotaBytes: number;
  compact?: boolean;
}) {
  const pct = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;
  const r = 16;
  const c = 2 * Math.PI * r;
  const ring = (
    <div className="relative h-10 w-10 shrink-0" role="img" aria-label={`已用空间 ${pct}%`}>
      <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="5" className="stroke-line" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          className={pct > 90 ? "stroke-warning" : "stroke-primary"}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xs font-semibold tabular-nums text-rail-ink">{pct}%</span>
    </div>
  );
  const usage = `${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)}`;
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center gap-0.5" title={usage}>
        <span className="sr-only">{usage}</span>
        {ring}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5" title={usage}>
      {ring}
      <div className="min-w-0">
        <div className="truncate text-xs font-medium tabular-nums text-ink">{usage}</div>
        <div className="text-2xs text-ink-faint">R2 出口流量免费</div>
      </div>
    </div>
  );
}
