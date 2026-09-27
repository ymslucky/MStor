import type * as React from "react";

// 图标按钮，44px 触控，aria-label 必填；active 用于分段控件激活态（accent-soft 底）
export function IconButton({ label, className = "", active = false, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  const state = active
    ? "border-accent/40 bg-accent-soft text-accent-strong"
    : "border-line bg-white text-ink-dim hover:border-accent/40 hover:bg-accent-soft hover:text-accent";
  return <button aria-label={label} title={label} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border transition-colors ${state} ${className}`} {...rest} />;
}
