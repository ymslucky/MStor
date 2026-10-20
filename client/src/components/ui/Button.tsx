import type * as React from "react";

// variant: primary | ghost | danger; size: md | sm。触控目标在 coarse 指针下人机尺寸自动 ≥44px
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; size?: "md" | "sm" }) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-btn font-medium transition-colors duration-(--duration-fast) disabled:opacity-45 disabled:pointer-events-none tap";
  const sizes = { md: "px-3.5 py-2 text-sm", sm: "px-2 py-1 text-xs" };
  const variants = {
    primary: "bg-primary text-white hover:bg-accent-deep active:bg-accent-deep",
    ghost: "bg-surface-1 text-ink border border-line hover:border-line-strong hover:bg-bg-sub",
    danger: "bg-surface-1 text-danger-text border border-line hover:bg-chip-rose-bg",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest} />;
}
