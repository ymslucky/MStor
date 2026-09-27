import type * as React from "react";

// variant: primary | ghost | danger; size: md | sm; 全部触控目标 ≥44px(coarse)
export function Button({ variant = "primary", size = "md", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; size?: "md" | "sm" }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none tap";
  const sizes = { md: "px-4 py-2.5 text-sm", sm: "px-2.5 py-1.5 text-xs" };
  const variants = {
    primary: "bg-accent text-white hover:bg-accent-strong",
    ghost: "bg-white text-ink border border-line hover:bg-accent-soft hover:text-accent-strong",
    danger: "bg-red-50 text-danger border border-red-200 hover:bg-red-100",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest} />;
}
