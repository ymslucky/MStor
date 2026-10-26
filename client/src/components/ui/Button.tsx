import type * as React from "react";
import { cn } from "../../lib/cn";

/**
 * 按钮：档案室的工作台控件。状态反馈统一走状态层；
 * 只做颜色反馈，不做形变。
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
    primary: "border-transparent bg-primary text-ink-inverse hover:bg-primary/88",
    ghost: "border-line-strong bg-surface-1 text-ink hover:bg-bg-sub",
    danger: "border-danger/20 bg-danger-soft text-danger-text hover:bg-danger/16",
  };
  return <button className={cn(base, sizes[size], variants[variant], className)} {...rest} />;
}
