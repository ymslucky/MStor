import type * as React from "react";

// 契约扩展：透传 ref（React 19 ref 即 prop），供 NameDialog 打开时自动全选
export function Input({ className = "", ...rest }: React.ComponentPropsWithRef<"input">) {
  return (
    <input
      className={`w-full rounded-input border border-line bg-surface-1 px-3 py-2 text-sm text-ink transition-colors duration-(--duration-fast) placeholder:text-ink-3 hover:border-line-strong focus:border-primary ${className}`}
      {...rest}
    />
  );
}
