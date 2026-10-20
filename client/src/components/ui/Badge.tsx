import type * as React from "react";

// 状态印标：等宽大写、方形、硬边框
export function Badge({
  tone = "default",
  children,
}: {
  tone?: "default" | "accent" | "danger" | "success";
  children: React.ReactNode;
}) {
  const tones = {
    default: "bg-bg-sub text-ink-2",
    accent: "bg-primary-soft text-primary-text",
    danger: "bg-danger-soft text-danger-text",
    success: "bg-success-soft text-success-text",
  };
  return (
    <span
      className={`inline-flex items-center rounded-chip border border-line px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
