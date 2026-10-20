import type * as React from "react";

// 玻璃卡片：半透明 + 模糊 + 顶部高光；类名保留以减小改动面
export function GlassCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`glass sheen relative overflow-hidden ${className}`}>{children}</div>;
}
