// 加载占位：块状、无圆角，与面板同构
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-card border border-line bg-line/50 ${className}`} aria-hidden />;
}
