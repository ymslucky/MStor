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
import { LibraryRail } from "./LibraryRail";
import { AccountMenu } from "./AccountMenu";
import { AppHeader } from "./AppHeader";
import { PAGE_TITLES } from "./nav";
import { useMe } from "./hooks";
import StorageMeter from "../components/StorageMeter";
import OfflineBar from "../components/OfflineBar";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { PendingApproval } from "./PendingApproval";

/**
 * Atelier Studio 外壳：左侧资料馆索引，顶部工作室栏，内容区作为画布。
 * 队列与浮层在导出层包住，切换路由不丢队列。
 */
function AppShellLayout() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [exitActOpen, setExitActOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  const title = PAGE_TITLES[pathname] ?? (pathname.startsWith("/settings") ? "设置" : "MStor");

  useEffect(() => {
    setUploadLimits(me?.limits);
  }, [me]);

  useEffect(() => {
    setMenuOpen(false);
    document.title = `${title} · MStor`;
  }, [pathname, title]);

  if (!me) return <div className="p-8 text-center text-ink-dim">加载中…</div>;
  if (me.pending) return <PendingApproval me={me} />;

  const sessionAccount = me.self ?? me;
  const actingAs = !!me.self && me.self.id !== me.id;

  return (
    <div className="relative min-h-dvh">
      <a
        href="#main-content"
        className="z-toast sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:rounded-btn focus:bg-surface-1 focus:px-3 focus:py-2 focus:text-sm focus:text-ink focus:shadow-lift"
      >
        跳到主要内容
      </a>
      <div className="relative z-content md:flex md:h-dvh">
        <aside className="hidden h-dvh w-66 shrink-0 flex-col border-r border-line bg-surface-sidebar md:flex">
          <LibraryRail
            workspaceName={me.workspace?.name}
            isPlatformAdmin={sessionAccount.role === "admin"}
          />
          <div className="space-y-3 border-t border-line px-3 py-4">
            <StorageMeter usedBytes={me.usedBytes} quotaBytes={me.quotaBytes} />
            <AccountMenu account={me} actingAs={actingAs} collapsed={false} onLogout={() => setLogoutOpen(true)} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            workspaceName={me.workspace?.name}
            accountName={me.name}
            unreadCount={me.unreadNotifications ?? 0}
            onLogout={() => setLogoutOpen(true)}
            onOpenMenu={() => setMenuOpen(true)}
          />
          <main
            id="main-content"
            className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:px-6 sm:py-6 md:flex md:min-h-0 md:flex-col md:px-8 md:py-8"
          >
            {actingAs && (
              <div className="mb-4 flex flex-wrap items-center gap-x-2 rounded-panel bg-warn-soft px-4 py-2 text-xs text-warn-text">
                正在以管理员身份查看「{me.name}」的空间
                <button className="font-medium underline" onClick={() => setExitActOpen(true)}>
                  退出该空间
                </button>
              </div>
            )}
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

export default function AppShell() {
  return (
    <UploadQueueProvider>
      <AppShellLayout />
      <GlobalUploadDock />
    </UploadQueueProvider>
  );
}
