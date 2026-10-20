import { createContext, useContext, type ReactNode } from "react";
import { useUploadQueue } from "./useUploadQueue";

/**
 * 上传队列提升到 AppShell 级：队列不再属于某个页面，切路由/刷新侧栏都不会丢。
 * 组件页只消费 context，不再各自 new 一个队列（原来 Browser 里那份会在离开页面时销毁）。
 */
type UploadQueue = ReturnType<typeof useUploadQueue>;

const UploadQueueContext = createContext<UploadQueue | null>(null);

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const queue = useUploadQueue();
  return <UploadQueueContext.Provider value={queue}>{children}</UploadQueueContext.Provider>;
}

export function useUploadQueueContext(): UploadQueue {
  const provided = useContext(UploadQueueContext);
  // 兼容：页面级单测会直接渲染页面而不挂 Provider，此时退回本地队列（hooks 顺序仍恒定）。
  // 生产路径始终拿到 AppShell 提供的共享队列。
  const fallback = useUploadQueue();
  return provided ?? fallback;
}
