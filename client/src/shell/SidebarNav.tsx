import { Cloud, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { IconButton, NavItem } from "../components/ui";
import { cn } from "../lib/cn";
import { SECTIONS } from "./nav";

/** 侧栏主体：品牌 + 折叠钮 + 分区导航（浏览 / 共享 / 系统） */
export function SidebarNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <>
      <div className={cn("flex items-center border-b border-line py-3.5", collapsed ? "flex-col gap-2 px-2" : "gap-2 px-3")}>
        <div className={cn("flex min-w-0 items-center", collapsed ? "justify-center" : "flex-1 gap-2.5")}>
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <Cloud size={20} />
          </span>
          {!collapsed && <span className="truncate font-display text-lg font-bold text-ink">MStor</span>}
        </div>
        <IconButton label={collapsed ? "展开侧栏" : "折叠侧栏"} onClick={onToggle} className="shrink-0">
          {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
        </IconButton>
      </div>

      <nav aria-label="主导航" className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="px-3 pb-1 text-2xs font-medium tracking-wide text-ink-3 uppercase">{section.title}</p>
            )}
            <div className="flex flex-col gap-0.5">
              {section.items.map(({ to, label, Icon }) => (
                <NavItem key={to} to={to} end={to === "/"} icon={<Icon size={18} />}>
                  {collapsed ? <span className="sr-only">{label}</span> : label}
                </NavItem>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </>
  );
}
