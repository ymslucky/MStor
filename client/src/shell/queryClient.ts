import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError, handleSessionExpired } from "../api/client";
import { toast } from "../components/Toaster";

/**
 * React Query 客户端工厂：会话过期（401）时走一次自动重登，其余错误统一 toast。
 * 从 AppShell 抽出——它和 UI 结构无关，放进独立模块便于单测与复用。
 */
export function makeQueryClient(): QueryClient {
  const onError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      handleSessionExpired();
      return;
    }
    toast(e instanceof Error ? e.message : "请求失败");
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}
