import type * as React from "react";
import { cn } from "../../lib/cn";

/**
 * 按钮：状态反馈统一走状态层（.state-layer → --state-hover/--state-press），
 * 不再按皮肤硬编码 hover 颜色；形变只保留按下时的轻微缩放。
 */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; size?: "md" | "sm" }) {
  const base =
    "state-layer inline-flex items-center justify-center gap-1.5 rounded-btn border font-medium transition-colors duration-(--duration-fast) ease-[var(--ease-standard)] disabled:opacity-45 disabled:pointer-events-none tap";
  const sizes = { md: "px-3.5 py-2 text-sm", sm: "px-2.5 py-1 text-xs" };
  const variants = {
    primary: "border-transparent bg-primary text-white hover:bg-primary/90",
    ghost: "border-line-strong bg-surface-1 text-ink hover:bg-bg-sub",
    danger: "border-transparent bg-danger-soft text-danger-text hover:bg-danger/15",
  };
  return <button className={cn(base, sizes[size], variants[variant], className)} {...rest} />;
}
