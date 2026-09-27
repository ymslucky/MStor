import type * as React from "react";

// 内容卡片（不含 blur，属于页面主体）
export function GlassCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-card border border-white/10 bg-white/[0.04] shadow-lift ${className}`}>{children}</div>;
}
