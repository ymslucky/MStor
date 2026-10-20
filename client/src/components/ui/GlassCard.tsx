import type * as React from "react";

// 面板：实色 + 2px 墨线 + 硬投影（类名保留以减小改动面）
export function GlassCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-card border-2 border-line-strong bg-surface-1 shadow-card ${className}`}>{children}</div>
  );
}
