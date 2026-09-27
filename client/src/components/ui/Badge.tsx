import type * as React from "react";

export function Badge({ tone = "default", children }: { tone?: "default" | "accent" | "danger" | "success"; children: React.ReactNode }) {
  const tones = { default: "bg-white/10 text-ink-dim", accent: "bg-sky-400/15 text-accent", danger: "bg-red-400/15 text-danger", success: "bg-emerald-400/15 text-success" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}
