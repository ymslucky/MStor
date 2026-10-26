import type { ReactNode } from "react";

/** 页面标题区：工作室作品的起止节奏，标题与动作保持一行或紧凑两行。 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-5 gap-y-3 border-b border-line pb-4">
      <div className="min-w-0">
        <h1 className="text-balance font-display text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
