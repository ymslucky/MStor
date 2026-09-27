import type * as React from "react";

// 唯一契约扩展：透传 ref（React 19 ref 即 prop），供 NameDialog 打开时自动全选
export function Input({ className = "", ...rest }: React.ComponentPropsWithRef<"input">) {
  return <input className={`w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent/60 focus:bg-white/10 ${className}`} {...rest} />;
}
