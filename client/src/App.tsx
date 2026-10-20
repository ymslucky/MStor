import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes, useOutletContext, useSearchParams } from "react-router-dom";
import { ApiError, handleSessionExpired, markSessionActive } from "./api/client";
import { getMe } from "./api/me";
import type { Me } from "./api/types";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Button } from "./components/ui";
import { nextTarget, renewSession } from "./lib/renew";
import AppShell, { makeQueryClient } from "./shell/AppShell";
import Browser from "./pages/Browser";
import SettingsPage from "./pages/SettingsPage";
import SharePage from "./pages/SharePage";
import SharesPage from "./pages/SharesPage";
import TrashPage from "./pages/TrashPage";

const queryClient = makeQueryClient();

// AppShell 的 <Outlet context={me} /> 提供当前用户
function SettingsRoute() {
  const me = useOutletContext<Me>();
  return <SettingsPage me={me} />;
}

// Access 未授权提示页：能加载到前端却拿到 401/403，说明 Access 会话未随请求到达（如账号未开通）。
// 不自动跳转——由用户点「重新登录」经 /auth/renew 让边缘重新裁决（会话已过期则重走 IdP），
// 避免「边缘放行但后端验签失败」时自动刷新形成循环。
function AccessDeniedHint({ message }: { message?: string }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="glow-radial" aria-hidden />
      <div className="glass relative z-10 w-full max-w-sm rounded-card p-8 text-center">
        <h1 className="font-display text-3xl font-bold text-ink">MStor</h1>
        <p className="mt-2 text-sm text-ink-2">私有家庭云盘 · 经 Cloudflare Access 保护</p>
        <p className="mt-4 text-xs text-ink-3">{message ?? "尚未获得访问授权，请确认已通过 Access 登录后重试。"}</p>
        <Button className="mt-6 w-full" onClick={() => renewSession()}>
          重新登录
        </Button>
      </div>
    </div>
  );
}

// /api/me 成功 → 标记「曾登录」（会话中途过期时经 /auth/renew 触发 Access 重登）；
// 401 → 曾登录则续期导航一次（边缘接管登录），否则渲染未授权提示页
function RequireAuth() {
  const query = useQuery({ queryKey: ["me"], queryFn: getMe });
  if (query.isPending) return <div className="p-8 text-center text-ink-dim">加载中…</div>;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 401 && handleSessionExpired()) {
      return <div className="p-8 text-center text-ink-dim">正在重新登录…</div>;
    }
    return (
      <AccessDeniedHint
        message={query.error instanceof ApiError && query.error.status === 403 ? query.error.message : undefined}
      />
    );
  }
  markSessionActive();
  return <AppShell />;
}

// /auth/renew：会话续期落地页。该路径在 SW 导航豁免表内，导航直达边缘（Access 会话过期时被 302 去 IdP），
// 登录回来后按 next 回跳原页面；next 仅接受同源应用内路径（防开放重定向）
function RenewRedirect() {
  const [params] = useSearchParams();
  return <Navigate to={nextTarget(params.get("next"))} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* 顶层兜底：任何未被内层接住的渲染异常都不会变成白屏 */}
      <ErrorBoundary>
        <Routes>
          <Route path="/s/:token" element={<SharePage />} />
          <Route path="/auth/renew" element={<RenewRedirect />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<Browser />} />
            <Route path="/shares" element={<SharesPage />} />
            <Route path="/trash" element={<TrashPage />} />
            <Route path="/settings" element={<SettingsRoute />} />
          </Route>
          {/* 兜底：任何未匹配路径（含陈旧 SW 缓存的 /cdn-cgi/* 授权回调）回首页，避免渲染空白页 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
