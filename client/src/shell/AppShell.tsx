import { MutationCache, QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { ApiError } from "../api/client";
import { getMe } from "../api/me";
import type { Me } from "../api/types";
import { formatBytes } from "../lib/format";
import SearchBox from "../components/SearchBox";
import OfflineBar from "../components/OfflineBar";
import { Toaster, toast } from "../components/Toaster";

export function makeQueryClient(): QueryClient {
  const onError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) return; // 已由 api() 跳登录
    toast(e instanceof Error ? e.message : "请求失败");
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

function useMe(): Me | undefined {
  const { data } = useQuery({ queryKey: ["me"], queryFn: getMe });
  return data;
}

const NAV = [
  { to: "/", label: "文件", icon: "📁" },
  { to: "/trash", label: "回收站", icon: "🗑️" },
  { to: "/shares", label: "分享", icon: "🔗" },
  { to: "/settings", label: "设置", icon: "⚙️" },
];

export default function AppShell() {
  const me = useMe();
  if (!me) return <div className="p-8 text-center text-ink-dim">加载中…</div>;
  const actAs = typeof localStorage !== "undefined" ? localStorage.getItem("mstor_act_as") : null;
  const pct = Math.min(100, Math.round((me.usedBytes / me.quotaBytes) * 100));
  return (
    <div className="min-h-screen">
      {/* 玻璃背板独立于 header：header 自带 backdrop-filter 会成为 fixed 后代的包含块，破坏移动端底部导航 */}
      <header className="sticky top-0 z-30">
        <div className="glass-panel pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
            <span className="bg-gradient-to-r from-sky-300 to-cyan-200 bg-clip-text text-lg font-bold text-transparent">
              MStor
            </span>
            {/* 桌面横向链接 / 移动底部 Tab：同一 DOM，responsive 切换 */}
            <nav
              aria-label="主导航"
              className="glass-panel safe-bottom fixed inset-x-0 bottom-0 z-30 flex py-1.5 md:static md:gap-1 md:rounded-none md:border-0! md:bg-transparent! md:py-0 md:[-webkit-backdrop-filter:none]! md:[backdrop-filter:none]!"
            >
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/"}
                  className={({ isActive }) =>
                    `relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-2 text-xs transition-colors md:min-h-0 md:flex-none md:flex-row md:rounded-lg md:px-2.5 md:py-1.5 md:text-sm ${
                      isActive
                        ? "text-accent after:absolute after:top-0 after:left-1/2 after:h-0.5 after:w-10 after:-translate-x-1/2 after:rounded-full after:bg-accent after:content-[''] md:bg-white/10 md:text-ink md:after:hidden"
                        : "text-ink-dim hover:text-ink md:hover:bg-white/5"
                    }`
                  }
                >
                  <span aria-hidden>{n.icon}</span>
                  <span>{n.label}</span>
                </NavLink>
              ))}
            </nav>
            <SearchBox />
            <div className="ml-auto flex items-center gap-3 text-sm">
              <div
                className="hidden w-32 sm:block"
                title={`${formatBytes(me.usedBytes)} / ${formatBytes(me.quotaBytes)}`}
              >
                <div className="h-1.5 w-full overflow-hidden rounded bg-white/10">
                  <div
                    className={`h-full rounded ${pct > 90 ? "bg-warning" : "bg-gradient-to-r from-sky-400 to-cyan-300"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-0.5 text-xs text-ink-dim">
                  {formatBytes(me.usedBytes)} / {formatBytes(me.quotaBytes)}
                </div>
              </div>
              <span>{me.name}</span>
              <a
                href="/auth/logout"
                aria-label="退出"
                title="退出"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-ink transition-colors hover:bg-white/10"
              >
                <span aria-hidden>🚪</span>
              </a>
            </div>
          </div>
          {actAs && (
            <div className="glass-subtle mx-auto max-w-5xl px-4 py-1.5 text-xs text-warning">
              正在以管理员身份查看「{me.name}」的空间
              <button
                className="ml-2 underline"
                onClick={() => {
                  localStorage.removeItem("mstor_act_as");
                  window.location.reload();
                }}
              >
                退出该空间
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="pb-nav mx-auto max-w-5xl p-4">
        <Outlet context={me} />
      </main>
      <OfflineBar />
      <Toaster />
    </div>
  );
}
