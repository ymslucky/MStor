import type { LucideIcon } from "lucide-react";
import type * as React from "react";

/** 空态：左对齐说明下一步，不把“没有数据”当成交付。 */
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="grid gap-4 px-4 py-10 text-left sm:grid-cols-[auto_1fr] sm:items-center sm:px-6 sm:py-12" data-testid="empty-state">
      <span className="flex h-12 w-12 items-center justify-center rounded-panel bg-bg-sub text-ink-2">
        <Icon size={22} strokeWidth={1.8} aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 max-w-xl text-sm text-ink-3">{description}</p>}
        {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}
