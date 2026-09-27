import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Route, Routes, useOutletContext } from "react-router-dom";
import { handleSessionExpired, markSessionActive } from "./api/client";
import { getMe } from "./api/me";
import type { Me } from "./api/types";
import { Button, GlassCard } from "./components/ui";
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
function LoginLanding() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <GlassCard className="w-full max-w-sm p-8 text-center">
        <h1 className="bg-gradient-to-r from-sky-300 to-cyan-200 bg-clip-text text-3xl font-bold text-transparent">
          MStor
        </h1>
        <p className="mt-2 text-sm text-ink-dim">私有家庭云盘 · 登录后开始使用</p>
        <Button className="mt-6 w-full" onClick={() => (window.location.href = "/auth/login")}>
          登录
        </Button>
      </GlassCard>
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
