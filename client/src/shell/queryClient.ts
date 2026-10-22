import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError, handleSessionExpired } from "../api/client";
import { toast } from "../components/Toaster";

/**
 * React Query 客户端工厂：会话过期（401）时走一次自动重登，其余错误统一 toast。
 * 从 AppShell 抽出——它和 UI 结构无关，放进独立模块便于单测与复用。
 */
export function makeQueryClient(): QueryClient {
  const onError = (e: unknown) => {
    // 仅业务接口的 401 才触发 Access 重登；/api/s/* 的 401 是分享提取码错误，
    // 公开分享页没有会话可言，不能把已登录用户送去 /auth/renew
    if (e instanceof ApiError && e.status === 401 && !e.path?.startsWith("/api/s/")) {
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
