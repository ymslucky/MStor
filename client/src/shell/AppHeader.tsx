import { Cloud, LogOut, Menu } from "lucide-react";
import { CommandPalette } from "../components/CommandPalette";
import { NotificationBell } from "../components/NotificationBell";
import { IconButton } from "../components/ui";

/** 工作台栏：移动端承担品牌与菜单，桌面端标明当前档案空间。 */
export function AppHeader({
  workspaceName,
  unreadCount = 0,
  onLogout,
  onOpenMenu,
}: {
  workspaceName?: string;
  unreadCount?: number;
  onLogout: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface-raised px-3 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="md:hidden">
          <IconButton label="打开导航" onClick={onOpenMenu}>
            <Menu size={18} aria-hidden />
          </IconButton>
        </span>
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-panel bg-primary text-ink-inverse md:hidden"
        >
          <Cloud size={17} strokeWidth={2} />
        </span>
        <span className="truncate text-sm font-semibold text-ink md:hidden">MStor</span>

        <div className="hidden min-w-0 md:block">
          <p className="truncate text-sm font-semibold text-ink">{workspaceName ?? "我的空间"}</p>
          <p className="truncate text-2xs text-ink-3">MStor · 家庭档案室</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <CommandPalette />
        <NotificationBell initialUnread={unreadCount} />
        <span className="md:hidden">
          <IconButton label="退出" onClick={onLogout}>
            <LogOut size={18} aria-hidden />
          </IconButton>
        </span>
      </div>
    </header>
  );
}
