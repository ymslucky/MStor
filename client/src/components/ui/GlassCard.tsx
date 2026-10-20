import type * as React from "react";

// 内容卡片：实色 + 发丝边框 + 极浅投影（不再是玻璃面）；类名保留以减小改动面
export function GlassCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-card border border-line bg-surface-1 shadow-card ${className}`}>{children}</div>;
}
