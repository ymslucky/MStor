import type * as React from "react";

// variant: primary | ghost | danger; size: md | sm; 全部触控目标 ≥44px(coarse)
export function Button({ variant = "primary", size = "md", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; size?: "md" | "sm" }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none tap";
  const sizes = { md: "px-4 py-2.5 text-sm", sm: "px-2.5 py-1.5 text-xs" };
  const variants = {
    primary: "bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-lift hover:brightness-110",
    ghost: "bg-white/5 text-ink hover:bg-white/10 border border-white/10",
    danger: "bg-red-500/15 text-danger border border-red-400/30 hover:bg-red-500/25",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest} />;
}
