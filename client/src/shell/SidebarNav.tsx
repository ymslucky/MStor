import { Cloud, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLink } from "react-router-dom";
import { IconButton } from "../components/ui";
import { NAV } from "./nav";

/** 侧栏主体：品牌 + 折叠钮 + 主导航（折叠态仅图标，title 补文字） */
export function SidebarNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <>
      <div className={`flex items-center border-b border-line py-3.5 ${collapsed ? "flex-col gap-2 px-2" : "gap-2 px-3"}`}>
        <div className={`flex min-w-0 items-center ${collapsed ? "justify-center" : "flex-1 gap-2.5"}`}>
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <Cloud size={20} />
          </span>
          {!collapsed && <span className="truncate font-display text-lg font-bold text-ink">MStor</span>}
        </div>
        <IconButton label={collapsed ? "展开侧栏" : "折叠侧栏"} onClick={onToggle} className="shrink-0">
          {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
        </IconButton>
      </div>
      <nav aria-label="主导航" className="flex flex-1 flex-col gap-1 px-2 py-3">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm transition-colors ${collapsed ? "justify-center" : ""} ${
                isActive
                  ? "bg-primary-soft font-medium text-primary-text"
                  : "text-ink-2 hover:bg-primary-soft/60 hover:text-primary-text"
              }`
            }
          >
            <Icon size={18} aria-hidden className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
