import type * as React from "react";

// 图标按钮，44px 触控，aria-label 必填
export function IconButton({ label, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-ink-dim transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent ${className}`} {...rest} />;
}
