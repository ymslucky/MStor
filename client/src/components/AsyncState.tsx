import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { friendlyMessage } from "../api/client";
import { Button, EmptyState, ListSkeleton } from "./ui";

/** 只读查询的最小形状：让本组件可被任意 useQuery 结果驱动，也便于测试注入 */
interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  /** 有缓存数据时错误只做「内联降级」，不替换内容（离线缓存界面） */
  data?: unknown;
  /** React Query 的 fetchStatus：idle + pending 说明查询被 enabled:false 禁用，不能当成加载中 */
  fetchStatus?: "fetching" | "paused" | "idle";
  refetch: () => unknown;
}

/**
 * 查询三态统一壳：pending → ListSkeleton；error（无数据）→ 可重试错误空态；
 * error 但有缓存数据 → 顶部内联错误条 + 继续展示缓存（与 OfflineBar「显示的是缓存界面」一致）；
 * ready → children。
 * 修复「收藏/最近/标签/回收站/分享/审计页把请求失败渲染成空数据」的误导性空态。
 */
export function AsyncState({
  query,
  skeletonRows = 4,
  errorTitle = "加载失败",
  skeletonClassName = "",
  children,
}: {
  query: QueryLike;
  skeletonRows?: number;
  errorTitle?: string;
  skeletonClassName?: string;
  children: ReactNode;
}) {
  if (query.isPending) {
    // enabled:false 的查询会永远 pending 且 fetchStatus=idle：直接渲染 children（由调用方保证数据存在）
    if (query.fetchStatus === "idle") return <>{children}</>;
    return <ListSkeleton rows={skeletonRows} className={skeletonClassName} />;
  }
  if (query.isError && query.data === undefined) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title={errorTitle}
        description={friendlyMessage(query.error)}
        action={
          <Button variant="ghost" onClick={() => void query.refetch()}>
            重试
          </Button>
        }
      />
    );
  }
  return (
    <>
      {query.isError && (
        <div
          role="alert"
          className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-card border border-danger-soft bg-danger-soft px-3 py-2 text-xs text-danger-text"
        >
          <span className="min-w-0">更新失败：{friendlyMessage(query.error)}（显示的是缓存内容）</span>
          <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      )}
      {children}
    </>
  );
}
