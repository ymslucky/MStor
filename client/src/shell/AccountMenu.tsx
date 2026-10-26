import { LogOut, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { IconButton, Pill } from "../components/ui";

/** 账户行：命令轨保留可访问身份与动作，移动/展开场景显示完整身份。 */
export function AccountMenu({
  account,
  collapsed,
  onLogout,
  actingAs = false,
}: {
  account: { name: string; role: "admin" | "member" };
  collapsed: boolean;
  onLogout: () => void;
  actingAs?: boolean;
}) {
  const roleLabel = account.role === "admin" ? "管理员" : "成员";
  return (
    <div className={collapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-2.5 px-1"}>
      <span
        aria-hidden
        title={account.name}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-ink-inverse"
      >
        {account.name.charAt(0)}
      </span>
      {collapsed ? (
        <span className="sr-only">
          {account.name} · {actingAs ? "管理员代管" : roleLabel}
        </span>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{account.name}</div>
          {actingAs ? <Pill tone="warn">管理员代管</Pill> : <Pill tone="accent">{roleLabel}</Pill>}
        </div>
      )}
      <NavLink
        to="/settings"
        aria-label="设置"
        title="设置"
        className={
          collapsed
            ? "inline-flex h-9 w-9 items-center justify-center rounded-btn text-rail-ink-2 transition-colors hover:bg-white/8 hover:text-rail-ink"
            : "inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-bg-sub hover:text-ink"
        }
      >
        <Settings size={18} aria-hidden />
      </NavLink>
      <IconButton
        label="退出"
        onClick={onLogout}
        className={collapsed ? "text-rail-ink-2 hover:bg-white/8 hover:text-rail-ink" : ""}
      >
        <LogOut size={18} aria-hidden />
      </IconButton>
    </div>
  );
}
