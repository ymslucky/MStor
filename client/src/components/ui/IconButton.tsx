import type * as React from "react";

// 图标按钮：coarse 指针下通过 .tap 保证 ≥44px；active 用于分段控件
export function IconButton({
  label,
  className = "",
  active = false,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  const state = active
    ? "border-primary/40 bg-primary-soft text-primary-text"
    : "border-line bg-surface-1 text-ink-2 hover:border-line-strong hover:bg-bg-sub hover:text-ink";
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-btn border transition-colors duration-(--duration-fast) tap ${state} ${className}`}
      {...rest}
    />
  );
}
