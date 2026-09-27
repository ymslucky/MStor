import { MutationCache, QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Cloud, FolderOpen, LogOut, PanelLeftClose, PanelLeftOpen, Settings, Share2, Trash2 } from "lucide-react";
import { ApiError, clearSessionFlag, handleSessionExpired } from "../api/client";
import { getMe } from "../api/me";
import type { Me } from "../api/types";
import { Badge, ConfirmDialog, IconButton } from "../components/ui";
import SearchBox from "../components/SearchBox";
import OfflineBar from "../components/OfflineBar";
import StorageMeter from "../components/StorageMeter";
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

// 侧栏折叠状态持久化 localStorage("mstor_sidebar")
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("mstor_sidebar") === "collapsed");
  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("mstor_sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  return { collapsed, toggle };
}

const NAV = [
  { to: "/", label: "文件", Icon: FolderOpen },
  { to: "/trash", label: "回收站", Icon: Trash2 },
  { to: "/shares", label: "分享", Icon: Share2 },
  { to: "/settings", label: "设置", Icon: Settings },
];

// 顶部工具栏左侧页面标题（文件页的面包屑由页内渲染，工具栏只放页名）
const PAGE_TITLES: Record<string, string> = { "/": "文件", "/trash": "回收站", "/shares": "分享", "/settings": "设置" };

export default function AppShell() {
  const me = useMe();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();
  const { pathname } = useLocation();
  if (!me) return <div className="p-8 text-center text-ink-dim">加载中…</div>;
  const actAs = typeof localStorage !== "undefined" ? localStorage.getItem("mstor_act_as") : null;

  // 退出按钮共用同一确认弹窗：移动顶栏与桌面档案行各一份
  const logoutButton = (className = "") => (
    <IconButton label="退出" onClick={() => setLogoutOpen(true)} className={className}>
      <LogOut size={18} aria-hidden />
    </IconButton>
  );

  return (
    <div className="relative min-h-dvh">
      <div className="glow-radial" aria-hidden />
      <div className="relative z-10 md:flex">
        {/* 桌面侧边栏：glass 玻璃面 sticky，展开 240px / 折叠 64px */}
        <aside
          className={`glass sticky top-0 z-30 hidden h-dvh shrink-0 flex-col transition-[width] duration-200 ease-(--ease-spring) md:flex ${
            collapsed ? "md:w-16" : "md:w-60"
          }`}
        >
          {/* 顶部：品牌 + 折叠钮 */}
          <div className={`flex items-center border-b border-line py-3.5 ${collapsed ? "flex-col gap-2 px-2" : "gap-2 px-3"}`}>
            <div className={`flex min-w-0 items-center ${collapsed ? "justify-center" : "flex-1 gap-2.5"}`}>
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
                <Cloud size={20} />
              </span>
              {!collapsed && <span className="truncate font-display text-lg font-bold text-ink">MStor</span>}
            </div>
            <IconButton label={collapsed ? "展开侧栏" : "折叠侧栏"} onClick={toggle} className="shrink-0">
              {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
            </IconButton>
          </div>
          {/* 导航：折叠态只显图标（title 提示文字），激活态 primary-soft 底 + primary-text 字 */}
          <nav aria-label="主导航" className="flex flex-1 flex-col gap-1 px-2 py-3">
            {NAV.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
                    collapsed ? "justify-center" : ""
                  } ${isActive ? "bg-primary-soft font-medium text-primary-text" : "text-ink-2 hover:bg-primary-soft/60 hover:text-primary-text"}`
                }
              >
                <Icon size={18} aria-hidden className="shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </nav>
          {/* 底部：存储用量环形图 + 用户档案行 */}
          <div className={`space-y-3 border-t border-line py-4 ${collapsed ? "px-2" : "px-3"}`}>
            <StorageMeter usedBytes={me.usedBytes} quotaBytes={me.quotaBytes} compact={collapsed} />
            <div className={`flex items-center gap-2.5 ${collapsed ? "flex-col" : "px-1"}`}>
              <span
                aria-hidden
                title={collapsed ? me.name : undefined}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-text"
              >
                {me.name.charAt(0)}
              </span>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{me.name}</div>
                  <Badge tone="accent">{me.role === "admin" ? "管理员" : "成员"}</Badge>
                </div>
              )}
              {logoutButton()}
            </div>
          </div>
        </aside>
        {/* 内容列：自适应全宽 */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 顶部工具栏 56px：md+ 左侧页名 + 右侧搜索；移动端简化为品牌 + 退出 */}
          <header className="glass-light sticky top-0 z-20">
            <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white md:hidden">
                  <Cloud size={20} />
                </span>
                <p className="hidden truncate font-display text-base font-semibold text-ink md:block">{PAGE_TITLES[pathname] ?? "MStor"}</p>
              </div>
              <div className="flex items-center gap-2">
                <SearchBox />
                {logoutButton("md:hidden")}
              </div>
            </div>
          </header>
          <main className="min-w-0 flex-1 px-4 py-4 pb-nav sm:px-6 sm:py-6 md:pb-6">
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
      </div>
      {/* 移动端底部 Tab（浅玻璃 + 安全区） */}
      <nav aria-label="底部导航" className="glass-light safe-bottom fixed inset-x-0 bottom-0 z-40 flex px-2 py-1.5 md:hidden">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-xs transition-colors ${
                isActive ? "bg-primary-soft font-medium text-primary-text" : "text-ink-2 hover:text-primary-text"
              }`
            }
          >
            <Icon size={18} aria-hidden />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <ConfirmDialog
        open={logoutOpen}
        title="退出登录"
        description="确定要退出当前账号吗？"
        confirmText="退出"
        danger
        onConfirm={() => {
          setLogoutOpen(false);
          clearSessionFlag();
          window.location.href = "/auth/logout";
        }}
        onCancel={() => setLogoutOpen(false)}
      />
      <OfflineBar />
      <Toaster />
    </div>
  );
}
