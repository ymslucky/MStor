import { Cloud, LogOut, Menu } from "lucide-react";
import SearchBox from "../components/SearchBox";
import { NotificationBell } from "../components/NotificationBell";
import { IconButton } from "../components/ui";

/** 顶栏：左侧（移动端）汉堡 + 页名/品牌，右侧通知/搜索/退出 */
export function TopBar({ title, onLogout, onOpenMenu }: { title: string; onLogout: () => void; onOpenMenu: () => void }) {
  return (
    <header className="glass-light sticky top-0 z-20">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton label="打开导航" onClick={onOpenMenu} className="md:hidden">
            <Menu size={18} aria-hidden />
          </IconButton>
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white md:hidden">
            <Cloud size={20} />
          </span>
          <p className="hidden truncate font-display text-base font-semibold text-ink md:block">{title}</p>
          <p className="truncate font-display text-base font-semibold text-ink md:hidden">{title}</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <SearchBox />
          <IconButton label="退出" onClick={onLogout} className="md:hidden">
            <LogOut size={18} aria-hidden />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
