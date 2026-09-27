import type * as React from "react";

// icon(emoji) + 标题 + 描述 + 可选操作
export function EmptyState({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="py-16 text-center">
      <div className="text-4xl" aria-hidden>{icon}</div>
      <h3 className="mt-3 font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 text-sm text-ink-dim">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
