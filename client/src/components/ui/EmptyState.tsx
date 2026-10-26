import type { LucideIcon } from "lucide-react";
import type * as React from "react";

/** 空态：安静地说明下一步，让空位置仍然有方向。 */
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center" data-testid="empty-state">
      <span className="flex h-14 w-14 items-center justify-center rounded-panel bg-bg-sub text-ink-2">
        <Icon size={24} strokeWidth={1.7} aria-hidden />
      </span>
      <h2 className="mt-4 font-display text-base font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
