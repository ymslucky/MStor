import type * as React from "react";
import { cn } from "../../lib/cn";

// 契约扩展：透传 ref（React 19 ref 即 prop），供 NameDialog 打开时自动全选。
// class 合并走 cn（tailwind-merge）：调用方覆盖背景/圆角时不再依赖 CSS 生成顺序。
export function Input({ className, ...rest }: React.ComponentPropsWithRef<"input">) {
  return (
    <input
      className={cn(
        "w-full rounded-input border border-line bg-surface-1 px-3 py-2 text-sm text-ink transition-colors duration-(--duration-fast) placeholder:text-ink-3 hover:border-line-strong focus:border-primary focus:outline-none",
        className,
      )}
      {...rest}
    />
  );
}
