import { MutationCache, QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { ApiError, clearSessionFlag, handleSessionExpired } from "../api/client";
import { getMe } from "../api/me";
import type { Me } from "../api/types";
import { formatBytes } from "../lib/format";
import { Badge } from "../components/ui";
import SearchBox from "../components/SearchBox";
import OfflineBar from "../components/OfflineBar";
import { Toaster, toast } from "../components/Toaster";

export function makeQueryClient(): QueryClient {
  const onError = (e: unknown) => {
    // 会话中途过期：曾登录过则一次性自动重登（handleSessionExpired 自带防抖守卫）
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

// 退出按钮（<a> 保持跳转语义与 href 断言）：移动顶栏与桌面档案行各一份
const logoutCls =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink-dim transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export default function AppShell() {
  const me = useMe();
  if (!me) return <div className="p-8 text-center text-ink-dim">加载中…</div>;
  const actAs = typeof localStorage !== "undefined" ? localStorage.getItem("mstor_act_as") : null;
  const pct = Math.min(100, Math.round((me.usedBytes / me.quotaBytes) * 100));
  return (
    <div className="min-h-screen">
      {/* 侧边栏容器：md+ 固定左侧；移动端退化为普通文档流（品牌行即顶栏） */}
      <aside className="md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-60 md:flex-col md:border-r md:border-line md:bg-white">
        {/* 品牌行：移动端 = 顶栏一行（品牌 + 退出） */}
        <div className="flex items-center justify-between border-b border-line bg-white px-4 py-2.5 md:border-b-0 md:bg-transparent md:px-5 md:py-5">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white">
              M
            </span>
            <span className="text-lg font-bold text-ink">MStor</span>
          </div>
          <a href="/auth/logout" aria-label="退出" title="退出" onClick={() => clearSessionFlag()} className={`${logoutCls} md:hidden`}>
            <span aria-hidden>🚪</span>
          </a>
        </div>
        {/* 导航同一 DOM：移动端底部 Tab（fixed），md+ 侧边栏纵向链接 */}
        <nav
          aria-label="主导航"
          className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white/95 px-2 py-1.5 md:static md:z-auto md:flex-1 md:flex-col md:gap-1 md:border-t-0 md:bg-transparent md:px-3 md:py-2"
        >
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-xs transition-colors md:min-h-0 md:flex-none md:flex-row md:gap-3 md:px-3 md:py-2.5 md:text-sm ${
                  isActive
                    ? "text-accent-strong md:bg-accent-soft md:font-medium"
                    : "text-ink-dim hover:text-accent-strong md:hover:bg-gray-50"
                }`
              }
            >
              <span aria-hidden>{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        {/* 底部：存储用量小卡 + 用户档案行（仅桌面侧边栏） */}
        <div className="hidden space-y-3 border-t border-line px-4 py-4 md:block">
          <div className="rounded-xl bg-gray-50 p-3" title={`${formatBytes(me.usedBytes)} / ${formatBytes(me.quotaBytes)}`}>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full ${pct > 90 ? "bg-warning" : "bg-accent"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-ink-dim">
              {formatBytes(me.usedBytes)} / {formatBytes(me.quotaBytes)}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong"
            >
              {me.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{me.name}</div>
              <Badge tone="accent">{me.role === "admin" ? "管理员" : "成员"}</Badge>
            </div>
            <a href="/auth/logout" aria-label="退出" title="退出" onClick={() => clearSessionFlag()} className={logoutCls}>
              <span aria-hidden>🚪</span>
            </a>
          </div>
        </div>
      </aside>
      {/* 内容区 */}
      <div className="md:ml-60">
        <main className="pb-nav mx-auto max-w-6xl p-4 md:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-ink">
                {greeting()}，{me.name} 👋
              </h1>
              <p className="mt-0.5 text-sm text-ink-dim">这是你的私有云盘概览</p>
            </div>
            <SearchBox />
          </div>
          {actAs && (
            <div className="mb-4 flex flex-wrap items-center gap-x-2 rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-800">
              正在以管理员身份查看「{me.name}」的空间
              <button
                className="font-medium underline"
                onClick={() => {
                  localStorage.removeItem("mstor_act_as");
                  window.location.reload();
                }}
              >
                退出该空间
              </button>
            </div>
          )}
          <Outlet context={me} />
        </main>
      </div>
      <OfflineBar />
      <Toaster />
    </div>
  );
}
