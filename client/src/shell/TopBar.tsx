import { Cloud, LogOut, Menu } from "lucide-react";
import { NotificationBell } from "../components/NotificationBell";
import { IconButton } from "../components/ui";

/**
 * 仅移动端使用的极薄工具条（桌面端无顶栏：搜索走 ⌘K，通知走浮动气泡，导航在侧栏）。
 */
export function TopBar({ title, onLogout, onOpenMenu }: { title: string; onLogout: () => void; onOpenMenu: () => void }) {
  return (
    <header className="glass-light sticky top-0 z-sticky md:hidden">
      <div className="flex h-12 items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton label="打开导航" onClick={onOpenMenu}>
            <Menu size={18} aria-hidden />
          </IconButton>
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-white">
            <Cloud size={16} />
          </span>
          <p className="truncate text-sm font-semibold text-ink">{title}</p>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <IconButton label="退出" onClick={onLogout}>
            <LogOut size={18} aria-hidden />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
