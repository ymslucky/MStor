import type * as React from "react";

export function Badge({ tone = "default", children }: { tone?: "default" | "accent" | "danger" | "success"; children: React.ReactNode }) {
  const tones = { default: "bg-gray-100 text-ink-dim", accent: "bg-emerald-50 text-accent-strong", danger: "bg-red-50 text-danger", success: "bg-emerald-50 text-success" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}
