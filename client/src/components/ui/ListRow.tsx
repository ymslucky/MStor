import type * as React from "react";
import { cn } from "../../lib/cn";

/**
 * 列表行：高度走密度令牌，hover=E1、选中=accent-tint。
 * 用 div 而不是 button：行内通常还有按钮（操作用列），嵌套 button 不合法。
 */
export function ListRow({
  selected = false,
  className = "",
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { selected?: boolean }) {
  return (
    <div
      style={{ minHeight: "var(--density-row-h)" }}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 text-sm text-ink transition-colors",
        selected ? "bg-primary-soft/60" : "state-layer",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
