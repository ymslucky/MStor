import type * as React from "react";

// 状态标签：低饱和底 + 深一档前景；chip 圆角 + 2xs 字号
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
    danger: "bg-chip-rose-bg text-danger-text",
    success: "bg-chip-blue-bg text-success-text",
  };
  return (
    <span className={`inline-flex items-center rounded-chip px-1.5 py-0.5 text-2xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
