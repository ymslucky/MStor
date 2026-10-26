import { LogOut, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { IconButton, Pill } from "../components/ui";

/** 账户行：资料馆底部的身份、角色与设置/退出。 */
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
    <div
      className={
        collapsed
          ? "flex flex-col items-center gap-1"
          : "flex items-center gap-3 rounded-panel border border-line bg-surface-1 p-3"
      }
    >
      <span
        aria-hidden
        title={collapsed ? account.name : undefined}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-ink-inverse"
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
          <div className="mt-1">
            {actingAs ? <Pill tone="warn">管理员代管</Pill> : <Pill tone="accent">{roleLabel}</Pill>}
          </div>
        </div>
      )}
      <NavLink
        to="/settings"
        aria-label="设置"
        title="设置"
        className={
          collapsed
            ? "inline-flex h-9 w-9 items-center justify-center rounded-btn text-ink-2 transition-colors hover:bg-bg-sub hover:text-ink"
            : "inline-flex h-9 w-9 items-center justify-center rounded-btn text-ink-2 transition-colors hover:bg-bg-sub hover:text-ink"
        }
      >
        <Settings size={18} aria-hidden />
      </NavLink>
      <IconButton label="退出" onClick={onLogout}>
        <LogOut size={18} aria-hidden />
      </IconButton>
    </div>
  );
}
