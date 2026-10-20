import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { clearSessionFlag } from "../api/client";
import { setUploadLimits } from "../api/uploads";
import { STORAGE_KEYS, getString, removeItem, setString } from "../lib/storage";
import { ConfirmDialog } from "../components/ui";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { UploadQueueProvider } from "../hooks/UploadQueueProvider";
import { GlobalUploadDock } from "../components/GlobalUploadDock";
import { StatusBar } from "../components/StatusBar";
import { SidebarNav } from "./SidebarNav";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { AccountMenu } from "./AccountMenu";
import { TopBar } from "./TopBar";
import { NAV, PAGE_TITLES } from "./nav";
import { useMe, useSidebarCollapsed } from "./hooks";
import StorageMeter from "../components/StorageMeter";
import OfflineBar from "../components/OfflineBar";
import { Toaster } from "../components/Toaster";

/**
 * 外壳只负责「布局 + 会话级动作」：
 * 侧栏 = SidebarNav + WorkspaceSwitcher + StorageMeter + AccountMenu；
 * 顶栏 = TopBar；内容 = Outlet；底部 = StatusBar（桌面）+ 移动 Tab。
 * 队列与浮层在导出层包住，切换路由不丢队列。
 */
function AppShellLayout() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [exitActOpen, setExitActOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();
  const { pathname } = useLocation();

  // 上传上限由服务端下发（/api/me.limits），前端队列在此同步，避免前后端硬编码漂移
  useEffect(() => {
    setUploadLimits(me?.limits);
  }, [me]);

  if (!me) return <div className="p-8 text-center text-ink-dim">加载中…</div>;

  const actAs = getString(STORAGE_KEYS.actAs);
  // 档案行始终显示登录账号（self）：act-as 查看他人空间时当前空间用户会变化
  const account = me.self ?? me;

  // 切空间：写本地偏好 → 清缓存 → 整页重载，确保所有在途/缓存查询都带上新的 x-workspace
  const switchWorkspace = (id: string) => {
    if (!id || id === me.workspace?.id) return;
    setString(STORAGE_KEYS.workspace, id);
    queryClient.clear();
    window.location.reload();
  };

  return (
    <div className="relative min-h-dvh">
      <div className="glow-radial" aria-hidden />
      <div className="relative z-10 md:flex">
        <aside
          className={`glass sticky top-0 z-30 hidden h-dvh shrink-0 flex-col transition-[width] duration-200 ease-(--ease-spring) md:flex ${
            collapsed ? "md:w-16" : "md:w-60"
          }`}
        >
          <SidebarNav collapsed={collapsed} onToggle={toggle} />
          <div className={`space-y-3 border-t border-line py-4 ${collapsed ? "px-2" : "px-3"}`}>
            {!collapsed && (
              <WorkspaceSwitcher
                workspaces={me.workspaces ?? []}
                currentId={me.workspace?.id}
                onSwitch={switchWorkspace}
              />
            )}
            <StorageMeter usedBytes={me.usedBytes} quotaBytes={me.quotaBytes} compact={collapsed} />
            <AccountMenu account={account} collapsed={collapsed} onLogout={() => setLogoutOpen(true)} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar title={PAGE_TITLES[pathname] ?? "MStor"} onLogout={() => setLogoutOpen(true)} />
          <main className="min-w-0 flex-1 px-4 py-4 pb-nav sm:px-6 sm:py-6 md:pb-6">
            {actAs && (
              <div className="mb-4 flex flex-wrap items-center gap-x-2 rounded-xl bg-warn-soft px-4 py-2 text-xs text-warn-text">
                正在以管理员身份查看「{me.name}」的空间
                <button className="font-medium underline" onClick={() => setExitActOpen(true)}>
                  退出该空间
                </button>
              </div>
            )}
            {/* 页面级兜底：页面崩溃时侧栏与导航仍在；key=pathname 使切页自动复位 */}
            <ErrorBoundary key={pathname} compact title="这个页面出错了">
              <Outlet context={me} />
            </ErrorBoundary>
          </main>
          <StatusBar me={me} />
        </div>
      </div>

      {/* 移动端底部 Tab（玻璃 + 安全区） */}
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
        description="退出后将结束 Cloudflare Access 会话（对所有 Access 应用生效），确定继续吗？"
        confirmText="退出"
        danger
        onConfirm={async () => {
          setLogoutOpen(false);
          clearSessionFlag();
          queryClient.clear();
          // Access 全局登出：清除 Cloudflare 授权 cookie，随后需重新走 IdP 登录
          window.location.assign("/cdn-cgi/access/logout");
        }}
        onCancel={() => setLogoutOpen(false)}
      />
      <ConfirmDialog
        open={exitActOpen}
        title="退出该空间"
        description="确定返回你自己的空间吗？"
        confirmText="退出"
        onConfirm={() => {
          setExitActOpen(false);
          removeItem(STORAGE_KEYS.actAs);
          window.location.reload();
        }}
        onCancel={() => setExitActOpen(false)}
      />
      <OfflineBar />
      <Toaster />
    </div>
  );
}

/** 外壳出口：上传队列在所有页面之上，切换路由不会丢队列 */
export default function AppShell() {
  return (
    <UploadQueueProvider>
      <AppShellLayout />
      <GlobalUploadDock />
    </UploadQueueProvider>
  );
}
