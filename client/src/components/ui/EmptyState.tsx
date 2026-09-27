import type { LucideIcon } from "lucide-react";
import type * as React from "react";

// icon(Lucide 大图标) + 标题 + 描述 + 可选操作
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="py-16 text-center" data-testid="empty-state">
      <Icon size={44} strokeWidth={1.5} aria-hidden className="mx-auto text-ink-3" />
      <h3 className="mt-3 font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
