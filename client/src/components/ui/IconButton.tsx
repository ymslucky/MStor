import type * as React from "react";

// 图标按钮：圆形柔光 hover，active 用主色浅底
export function IconButton({
  label,
  className = "",
  active = false,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  const state = active ? "bg-primary-soft text-primary-text" : "state-layer text-ink-2 hover:text-ink";
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-btn transition-[background-color,color,box-shadow] duration-(--duration-fast) ease-(--ease-out-soft) tap ${state} ${className}`}
      {...rest}
    />
  );
}
