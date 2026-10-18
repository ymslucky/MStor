import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Route, Routes, useOutletContext } from "react-router-dom";
import { ApiError, handleSessionExpired, markSessionActive } from "./api/client";
import { getMe } from "./api/me";
import type { Me } from "./api/types";
import { Button } from "./components/ui";
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
// 不自动跳转——刷新无助于解决授权问题，反而可能形成循环；由用户手动重试。
function AccessDeniedHint({ message }: { message?: string }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="glow-radial" aria-hidden />
      <div className="glass relative z-10 w-full max-w-sm rounded-card p-8 text-center">
        <h1 className="font-display text-3xl font-bold text-ink">MStor</h1>
        <p className="mt-2 text-sm text-ink-2">私有家庭云盘 · 经 Cloudflare Access 保护</p>
        <p className="mt-4 text-xs text-ink-3">{message ?? "尚未获得访问授权，请确认已通过 Access 登录后重试。"}</p>
        <Button className="mt-6 w-full" onClick={() => window.location.assign(window.location.href)}>
          重新加载
        </Button>
      </div>
    </div>
  );
}

// /api/me 成功 → 标记「曾登录」（会话中途过期时整页刷新触发 Access 重登）；
// 401 → 曾登录则一次性刷新（Access 在边缘接管登录），否则渲染未授权提示页
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/s/:token" element={<SharePage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Browser />} />
          <Route path="/shares" element={<SharesPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/settings" element={<SettingsRoute />} />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}
