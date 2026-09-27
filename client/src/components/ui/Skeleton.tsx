// 加载占位
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/10 ${className}`} aria-hidden />;
}
