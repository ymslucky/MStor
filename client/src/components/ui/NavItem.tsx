import type * as React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn";

/** 常规导航项：移动抽屉和展开场景使用；当前项用信号紫浅底。 */
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
            ? "bg-primary-soft font-medium text-primary-text"
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
