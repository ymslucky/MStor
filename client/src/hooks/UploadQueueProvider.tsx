import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useUploadQueue } from "./useUploadQueue";

/**
 * 上传队列提升到 AppShell 级：队列不再属于某个页面，切路由/刷新侧栏都不会丢。
 *
 * 拆成 State / Actions 两个 context：
 * - 只有 Dock/StatusBar 订阅 items（每个进度 tick 重渲染）；
 * - 页面只订阅稳定的 actions（add/retry/…），上传进度不再让整个 Browser 子树重渲染。
 * Provider 是必需的：旧实现每次消费都 try 一个本地队列兜底，等于偷偷创建第二份队列。
 */
type UploadQueue = ReturnType<typeof useUploadQueue>;

export interface UploadQueueState {
  items: UploadQueue["items"];
}

export type UploadQueueActions = Pick<UploadQueue, "add" | "retry" | "cancel" | "purge" | "restoreFiles">;

const StateContext = createContext<UploadQueueState | null>(null);
const ActionsContext = createContext<UploadQueueActions | null>(null);

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const queue = useUploadQueue();
  // Actions 全部是 useUploadQueue 内的 useCallback，依赖稳定 → 进度更新不会换引用
  const actions = useMemo<UploadQueueActions>(
    () => ({
      add: queue.add,
      retry: queue.retry,
      cancel: queue.cancel,
      purge: queue.purge,
      restoreFiles: queue.restoreFiles,
    }),
    [queue.add, queue.retry, queue.cancel, queue.purge, queue.restoreFiles],
  );
  const state = useMemo<UploadQueueState>(() => ({ items: queue.items }), [queue.items]);

  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  );
}

function missing(hook: string): never {
  throw new Error(`${hook} 必须在 <UploadQueueProvider>（AppShell）内使用`);
}

/** 队列状态（items）：只有上传浮层/状态栏需要，进度变化时重渲染 */
export function useUploadQueueState(): UploadQueueState {
  return useContext(StateContext) ?? missing("useUploadQueueState");
}

/** 队列动作（add/retry/…）：引用稳定，页面只订阅它即可避免上传进度引发的整页重渲染 */
export function useUploadQueueActions(): UploadQueueActions {
  return useContext(ActionsContext) ?? missing("useUploadQueueActions");
}
