import { LogOut, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { IconButton, Pill } from "../components/ui";

/** 侧栏底部档案行：当前身份（act-as 时为被查看用户）+ 角色 + 退出 */
export function AccountMenu({
  account,
  collapsed,
  onLogout,
  actingAs = false,
}: {
  account: { name: string; role: "admin" | "member" };
  collapsed: boolean;
  onLogout: () => void;
  /** act-as：头像/名称已是目标用户，用「管理员代管」明确当前会话身份 */
  actingAs?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${collapsed ? "flex-col" : "px-1"}`}>
      <span
        aria-hidden
        title={collapsed ? account.name : undefined}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-text"
      >
        {account.name.charAt(0)}
      </span>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{account.name}</div>
          {actingAs ? <Pill tone="warn">管理员代管</Pill> : <Pill tone="accent">{account.role === "admin" ? "管理员" : "成员"}</Pill>}
        </div>
      )}
      <NavLink to="/settings" aria-label="设置" title="设置" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-bg-sub hover:text-ink">
        <Settings size={18} aria-hidden />
      </NavLink>
      <IconButton label="退出" onClick={onLogout}>
        <LogOut size={18} aria-hidden />
      </IconButton>
    </div>
  );
}
