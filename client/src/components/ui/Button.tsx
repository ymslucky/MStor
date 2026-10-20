import type * as React from "react";

// 工业风按钮：2px 墨线 + 硬投影，按下时位移到"贴板"状态
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; size?: "md" | "sm" }) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-btn border border-line-strong font-mono uppercase tracking-wider transition-transform duration-(--duration-fast) disabled:opacity-45 disabled:pointer-events-none tap shadow-card hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-soft active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";
  const sizes = { md: "px-3.5 py-2 text-xs", sm: "px-2 py-1 text-2xs" };
  const variants = {
    primary: "bg-primary text-surface-2 hover:bg-accent-deep",
    ghost: "bg-surface-1 text-ink hover:bg-primary-soft",
    danger: "bg-surface-1 text-danger-text hover:bg-danger-soft",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest} />;
}
