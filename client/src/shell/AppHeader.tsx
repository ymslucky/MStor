import { LogOut, Menu } from "lucide-react";
import { CommandPalette } from "../components/CommandPalette";
import { NotificationBell } from "../components/NotificationBell";
import { IconButton } from "../components/ui";

/** 工作室栏：桌面显示空间与身份，移动端保留导航、品牌语境和关键动作。 */
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
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface-canvas px-4 sm:px-6 md:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="md:hidden">
          <IconButton label="打开导航" onClick={onOpenMenu}>
            <Menu size={19} aria-hidden />
          </IconButton>
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold tracking-tight text-ink md:text-lg">
            {workspaceName ?? "我的资料"}
          </p>
          <p className="truncate text-2xs text-ink-3">
            {accountName ? `${accountName} · ` : ""}MStor 私人资料工作室
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
