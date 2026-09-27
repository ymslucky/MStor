import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Route, Routes, useOutletContext } from "react-router-dom";
import { Cloud } from "lucide-react";
import { handleSessionExpired, markSessionActive } from "./api/client";
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

// 登录落地页：未登录的首次访问不自动跳转 authorize（防 IdP 限流），由用户主动发起
// glow 光晕背景 + 玻璃卡 + Cloud 品牌图标 + primary CTA
function LoginLanding() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="glow-radial" aria-hidden />
      <div className="glass relative z-10 w-full max-w-sm rounded-card p-8 text-center">
        <Cloud size={44} strokeWidth={1.5} aria-hidden className="mx-auto text-primary-text" />
        <h1 className="mt-3 font-display text-3xl font-bold text-ink">MStor</h1>
        <p className="mt-2 text-sm text-ink-2">私有家庭云盘 · 登录后开始使用</p>
        <Button className="mt-6 w-full" onClick={() => (window.location.href = "/auth/login")}>
          登录
        </Button>
      </div>
    </div>
  );
}

// /api/me 成功 → 标记「曾登录」（会话中途过期时自动重登）；401 → 曾登录则一次性跳转重登，否则渲染登录落地页
function RequireAuth() {
  const query = useQuery({ queryKey: ["me"], queryFn: getMe });
  if (query.isPending) return <div className="p-8 text-center text-ink-dim">加载中…</div>;
  if (query.isError) {
    if (query.error instanceof Error && query.error.name === "ApiError" && handleSessionExpired()) {
      return <div className="p-8 text-center text-ink-dim">正在重新登录…</div>;
    }
    return <LoginLanding />;
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
