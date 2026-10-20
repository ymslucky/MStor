import type * as React from "react";

// 明亮按钮：主按钮实色 + 柔和投影，hover 抬升、按下微缩（spring）
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; size?: "md" | "sm" }) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-btn border font-medium transition-[transform,box-shadow,background-color] duration-(--duration-fast) ease-[var(--ease-spring)] disabled:opacity-45 disabled:pointer-events-none tap active:scale-[0.985]";
  const sizes = { md: "px-3.5 py-2 text-sm", sm: "px-2.5 py-1 text-xs" };
  const variants = {
    primary: "border-transparent bg-primary text-white shadow-card hover:bg-accent-deep hover:shadow-lift",
    ghost: "border-line-strong bg-white/70 text-ink shadow-soft backdrop-blur-sm hover:bg-white hover:shadow-card",
    danger: "border-transparent bg-danger-soft text-danger-text shadow-soft hover:bg-danger hover:text-white hover:shadow-card",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest} />;
}
