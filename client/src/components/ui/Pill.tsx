import type * as React from "react";
import { cn } from "../../lib/cn";

/**
 * 胶囊标签：唯一的「rounded-full + 浅底 + 2xs」出处。
 * 不要手写 `rounded-full bg-x-soft px-1.5 py-0.5 text-2xs`。
 */
export function Pill({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: "neutral" | "accent" | "success" | "warn" | "danger";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-bg-sub text-ink-2",
    accent: "bg-primary-soft text-primary-text",
    success: "bg-success-soft text-success-text",
    warn: "bg-warn-soft text-warn-text",
    danger: "bg-danger-soft text-danger-text",
  };
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-2xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}
