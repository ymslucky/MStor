import { LogOut, Menu } from "lucide-react";
import { CommandPalette } from "../components/CommandPalette";
import { NotificationBell } from "../components/NotificationBell";
import { IconButton } from "../components/ui";

/** 工作台栏：桌面显示当前空间、身份和任务语境；移动端保留导航与关键动作。 */
export function AppHeader({
  workspaceName,
  accountName,
  unreadCount = 0,
  onLogout,
  onOpenMenu,
}: {
  workspaceName?: string;
  accountName?: string;
  unreadCount?: number;
  onLogout: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface-1 px-3 sm:px-5 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="md:hidden">
          <IconButton label="打开导航" onClick={onOpenMenu}>
            <Menu size={19} aria-hidden />
          </IconButton>
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink md:text-base">{workspaceName ?? "我的空间"}</p>
          <span className="sr-only">MStor</span>`n          <p className="truncate text-2xs text-ink-3">
            {accountName ? `${accountName} · ` : ""}MStor 个人数据操作台
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <CommandPalette />
        <NotificationBell initialUnread={unreadCount} />
        <span className="md:hidden">
          <IconButton label="退出" onClick={onLogout}>
            <LogOut size={19} aria-hidden />
          </IconButton>
        </span>
      </div>
    </header>
  );
}
