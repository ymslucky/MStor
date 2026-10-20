import type * as React from "react";
import { cn } from "../../lib/cn";

/**
 * 设置行：左列「标签 + 说明」，右列「控件」的两列栅格。
 * 只负责对齐与分隔线；控件自己带 Field 的标签/校验。
 */
export function SettingRow({
  title,
  hint,
  className = "",
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(9rem,12rem)_1fr] items-start gap-3 border-b border-line py-3 last:border-b-0",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        {hint && <p className="mt-0.5 text-2xs text-ink-3">{hint}</p>}
      </div>
      <div className="min-w-0 space-y-2">{children}</div>
    </div>
  );
}
