// 加载占位：用描边色而不是灰块，暗色下也不突兀
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-card bg-line/70 ${className}`} aria-hidden />;
}
