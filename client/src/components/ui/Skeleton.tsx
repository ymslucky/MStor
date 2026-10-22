// 加载占位：玻璃底 + 流光（保留 animate-pulse 作为无障碍/测试可识别的加载态标记）
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse relative overflow-hidden rounded-card bg-surface-2/60 ${className}`}
      aria-hidden
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(255 255 255 / 0) 0%, rgb(255 255 255 / 0.65) 50%, rgb(255 255 255 / 0) 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.4s linear infinite, pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      }}
    />
  );
}
