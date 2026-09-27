// 加载占位
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200/70 ${className}`} aria-hidden />;
}
