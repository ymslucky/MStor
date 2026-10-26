import type * as React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn";

/** 档案索引项：选中使用中性底 + 3px 墨绿 rail。 */
export function NavItem({
  to,
  icon,
  end,
  onNavigate,
  children,
}: {
  to: string;
  icon?: React.ReactNode;
  end?: boolean;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      style={{ minHeight: "var(--density-row-h)" }}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-btn px-3 text-sm transition-colors",
          isActive
            ? "bg-bg-sub font-medium text-ink shadow-[inset_3px_0_0_var(--color-primary)]"
            : "state-layer text-ink-2 hover:text-ink",
        )
      }
    >
      {icon && (
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
      )}
      <span className="truncate">{children}</span>
    </NavLink>
  );
}
