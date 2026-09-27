import type * as React from "react";

// 图标按钮，44px 触控，aria-label 必填
export function IconButton({ label, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-ink hover:bg-white/10 border border-white/10 transition-colors ${className}`} {...rest} />;
}
