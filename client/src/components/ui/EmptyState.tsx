import type { LucideIcon } from "lucide-react";
import type * as React from "react";

// icon(Lucide 大图标) + 标题 + 描述 + 可选操作
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center py-16 text-center" data-testid="empty-state">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-sub">
        <Icon size={22} strokeWidth={1.75} aria-hidden className="text-ink-3" />
      </span>
      {/* 页面级空态：各页 h1 之下应为 h2（避免标题层级跳级） */}
      <h2 className="mt-4 text-base font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
