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
import { CommandPalette } from "../components/CommandPalette";
import { NotificationBell } from "../components/NotificationBell";
import { PAGE_TITLES, sectionsFor } from "./nav";
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
  // 移动端导航抽屉（替代底部 Tab，避免与批量条/浮层抢底部空间）
  const [menuOpen, setMenuOpen] = useState(false);
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
      <div className="relative z-content md:flex md:h-dvh">
        <aside
          className={`glass sticky top-0 z-nav hidden h-dvh shrink-0 flex-col transition-[width] duration-200 ease-(--ease-spring) md:flex ${
            collapsed ? "md:w-16" : "md:w-60"
          }`}
        >
          <SidebarNav collapsed={collapsed} onToggle={toggle} isPlatformAdmin={account.role === "admin"} />
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
          <TopBar
            title={PAGE_TITLES[pathname] ?? (pathname.startsWith("/settings") ? "设置" : "MStor")}
            onLogout={() => setLogoutOpen(true)}
            onOpenMenu={() => setMenuOpen(true)}
          />
          <main className="min-w-0 flex-1 px-4 py-4 pb-nav sm:px-6 sm:py-6 md:flex md:min-h-0 md:flex-col md:py-4">
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
          {/* 桌面端浮动簇：搜索（⌘K）与通知气泡；移动端这些在顶栏与抽屉里 */}
          <div className="pointer-events-none fixed right-5 bottom-14 z-overlay hidden flex-col items-end gap-2 md:flex">
            <div className="pointer-events-auto">
              <NotificationBell />
            </div>
            <div className="pointer-events-auto">
              <CommandPalette />
            </div>
          </div>
          <StatusBar me={me} />
        </div>
      </div>

      {/* 移动端导航抽屉 */}
      {menuOpen && (
        <div className="fixed inset-0 z-modal md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
          <div
            role="dialog"
            aria-label="导航"
            data-testid="mobile-drawer"
            className="anim-pop absolute inset-y-0 left-0 flex w-64 flex-col bg-surface-1 shadow-glass"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarNav collapsed={false} onToggle={() => setMenuOpen(false)} isPlatformAdmin={account.role === "admin"} />
            <div className="space-y-1 border-t border-line px-2 py-3">
              {sectionsFor(account.role === "admin")
                .flatMap((s) => s.items)
                .map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
                      isActive ? "bg-primary-soft font-medium text-primary-text" : "text-ink-2 hover:bg-primary-soft/60"
                    }`
                  }
                >
                  <Icon size={18} aria-hidden />
                  {label}
                </NavLink>
              ))}
              <NavLink
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
                    isActive ? "bg-primary-soft font-medium text-primary-text" : "text-ink-2 hover:bg-primary-soft/60"
                  }`
                }
              >
                设置
              </NavLink>
            </div>
          </div>
        </div>
      )}
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
