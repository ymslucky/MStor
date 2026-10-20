import type * as React from "react";

// 胶囊标签：浅底深字，柔和
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
