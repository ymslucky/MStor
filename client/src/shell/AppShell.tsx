import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { clearSessionFlag } from "../api/client";
import { setUploadLimits } from "../api/uploads";
import { STORAGE_KEYS, removeItem } from "../lib/storage";
import { ConfirmDialog } from "../components/ui";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { UploadQueueProvider } from "../hooks/UploadQueueProvider";
import { GlobalUploadDock } from "../components/GlobalUploadDock";
import { StatusBar } from "../components/StatusBar";
import { SidebarNav } from "./SidebarNav";
import { AccountMenu } from "./AccountMenu";
import { AppHeader } from "./AppHeader";
import { PAGE_TITLES } from "./nav";
import { useMe, useSidebarCollapsed } from "./hooks";
import StorageMeter from "../components/StorageMeter";
import OfflineBar from "../components/OfflineBar";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { PendingApproval } from "./PendingApproval";

/**
 * 外壳只负责「布局 + 会话级动作」：
 * 侧栏 = SidebarNav + StorageMeter + AccountMenu；
 * 顶栏 = AppHeader（桌面/移动共用）；内容 = Outlet；底部 = StatusBar（桌面）。
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

  const title = PAGE_TITLES[pathname] ?? (pathname.startsWith("/settings") ? "设置" : "MStor");

  // 上传上限由服务端下发（/api/me.limits），前端队列在此同步，避免前后端硬编码漂移
  useEffect(() => {
    setUploadLimits(me?.limits);
  }, [me]);

  // 路由切换：关闭移动抽屉 + 更新文档标题（读屏/多标签/历史都能区分页面）
  useEffect(() => {
    setMenuOpen(false);
    document.title = `${title} · MStor`;
  }, [pathname, title]);

  if (!me) return <div className="p-8 text-center text-ink-dim">加载中…</div>;
  if (me.pending) return <PendingApproval me={me} />;

  // 以服务端返回的 self 判定 act-as，避免 localStorage 残留造成误判；
  // 档案行显示当前身份（目标用户），并用「管理员代管」标明会话仍是管理员。
  const sessionAccount = me.self ?? me;
  const actingAs = !!me.self && me.self.id !== me.id;
  const account = me;

  return (
    <div className="relative min-h-dvh">
      <a
        href="#main-content"
        className="z-toast sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:rounded-btn focus:bg-surface-1 focus:px-3 focus:py-2 focus:text-sm focus:text-ink focus:shadow-lift"
      >
        跳到主要内容
      </a>
      <div className="relative z-content md:flex md:h-dvh">
        <aside
          className={`hidden h-dvh shrink-0 flex-col border-r border-line bg-surface-1 transition-[width] duration-200 ease-(--ease-out-soft) md:flex ${
            collapsed ? "md:w-16" : "md:w-60"
          }`}
        >
          <SidebarNav collapsed={collapsed} onToggle={toggle} isPlatformAdmin={sessionAccount.role === "admin"} />
          <div className={`space-y-3 border-t border-line py-4 ${collapsed ? "px-2" : "px-3"}`}>
            <StorageMeter usedBytes={me.usedBytes} quotaBytes={me.quotaBytes} compact={collapsed} />
            <AccountMenu account={account} actingAs={actingAs} collapsed={collapsed} onLogout={() => setLogoutOpen(true)} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            workspaceName={me.workspace?.name}
            unreadCount={me.unreadNotifications ?? 0}
            onLogout={() => setLogoutOpen(true)}
            onOpenMenu={() => setMenuOpen(true)}
          />
          <main
            id="main-content"
            className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:py-6 md:flex md:min-h-0 md:flex-col md:px-8 md:py-6"
          >
            {actingAs && (
              <div className="mb-4 flex flex-wrap items-center gap-x-2 rounded-xl bg-warn-soft px-4 py-2 text-xs text-warn-text">
                正在以管理员身份查看「{me.name}」的空间
                <button className="font-medium underline" onClick={() => setExitActOpen(true)}>
                  退出该空间
                </button>
              </div>
            )}
            {/* 页面级兜底：页面崩溃时侧栏与导航仍在；key=pathname 使切页自动复位。
                Suspense 必须放在这里（而不是 App 根）：懒路由首次加载时不能卸载外壳与上传队列，
                chunk 加载失败也由这个 compact 边界接住，而不是整页白屏/整页报错。 */}
            <ErrorBoundary key={pathname} compact title="这个页面出错了">
              <Suspense
                fallback={
                  <div className="p-8 text-center text-sm text-ink-2" aria-busy="true">
                    加载中…
                  </div>
                }
              >
                <Outlet context={me} />
              </Suspense>
            </ErrorBoundary>
          </main>
          <StatusBar me={me} />
        </div>
      </div>

      <MobileNavDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        me={me}
        onLogout={() => {
          setMenuOpen(false);
          setLogoutOpen(true);
        }}
      />
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
          removeItem(STORAGE_KEYS.workspace);
          window.location.reload();
        }}
        onCancel={() => setExitActOpen(false)}
      />
      <OfflineBar />
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
