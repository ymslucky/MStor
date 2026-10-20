import { formatBytes } from "../lib/format";
import { GlassCard } from "./ui";
import StorageRing from "./StorageRing";

interface Props {
  hasQuota: boolean;
  used: number;
  quota: number;
  pct: number;
  hasData: boolean;
  dirStats: { files: number; dirs: number; size: number };
}

/** 文件页顶部指标：存储用量环 + 当前目录统计（纯展示） */
export function BrowserKpi({ hasQuota, used, quota, pct, hasData, dirStats }: Props) {
  return (
    <div className="mb-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <GlassCard className="flex items-center gap-3 p-4">
        <StorageRing pct={pct} />
        <div className="min-w-0">
          <div className="text-xs text-ink-faint">存储用量</div>
          <div className="truncate text-sm font-semibold text-ink" title={hasQuota ? `${formatBytes(used)} / ${formatBytes(quota)}` : undefined}>
            {hasQuota ? `${formatBytes(used)} / ${formatBytes(quota)}` : "-"}
          </div>
        </div>
      </GlassCard>
      <GlassCard className="flex flex-col justify-center gap-1 p-4">
        <div className="text-xs text-ink-faint">当前目录</div>
        <div className="text-sm font-semibold text-ink" data-testid="dir-stats">
          {hasData ? `${dirStats.files} 个文件 · ${dirStats.dirs} 个文件夹` : "-"}
        </div>
        <div className="text-xs text-ink-2">合计 {formatBytes(dirStats.size)}</div>
      </GlassCard>
    </div>
  );
}
