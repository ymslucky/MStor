import type * as React from "react";

// 契约扩展：透传 ref（React 19 ref 即 prop），供 NameDialog 打开时自动全选
export function Input({ className = "", ...rest }: React.ComponentPropsWithRef<"input">) {
  return (
    <input
      className={`w-full rounded-input border border-line-strong bg-surface-2 px-3 py-2 font-mono text-sm text-ink bezel transition-colors duration-(--duration-fast) placeholder:text-ink-3 focus:border-primary ${className}`}
      {...rest}
    />
  );
}
