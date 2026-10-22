import { cn } from "../../lib/cn";
import { Skeleton } from "./Skeleton";

/**
 * 列表加载占位：统一的 `rows × 整行骨架`，替代各页手写的 `Skeleton className="h-10 w-full"` 循环。
 * `aria-busy` 让读屏知道该区域仍在加载。
 */
export function ListSkeleton({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div aria-busy="true" className={cn("space-y-2", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
