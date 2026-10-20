interface Props {
  done: number;
  total: number;
}

/** 批量操作进行中的浮动进度条（弹窗底部语义）：处理中 i/n */
export function BatchProgress({ done, total }: Props) {
  const pct = Math.round((done / Math.max(total, 1)) * 100);
  return (
    <div data-testid="batch-progress" className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 sm:bottom-6">
      <div className="glass flex items-center gap-2 rounded-card px-3 py-2 text-sm text-ink">
        <span className="whitespace-nowrap">
          处理中 {done}/{total}
        </span>
        <div className="h-1.5 w-24 overflow-hidden rounded bg-bg-sub">
          <div className="h-full rounded bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
