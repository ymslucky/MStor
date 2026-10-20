import type * as React from "react";

// 图标按钮：圆形柔光 hover，active 用主色浅底
export function IconButton({
  label,
  className = "",
  active = false,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  const state = active
    ? "bg-primary-soft text-primary-text shadow-soft"
    : "text-ink-2 hover:bg-white hover:text-ink hover:shadow-soft";
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,color,box-shadow,transform] duration-(--duration-fast) ease-[var(--ease-spring)] hover:-translate-y-0.5 tap ${state} ${className}`}
      {...rest}
    />
  );
}
