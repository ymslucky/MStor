import { Cloud } from "lucide-react";
import { NavLink } from "react-router-dom";
import { sectionsFor } from "./nav";
import { cn } from "../lib/cn";

/** 桌面命令轨：常驻图标 + 短标签，为文件内容争取横向空间。 */
export function CommandRail({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const sections = sectionsFor(isPlatformAdmin);
  return (
    <>
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-rail-line">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-panel bg-primary text-ink-inverse"
        >
          <Cloud size={19} strokeWidth={2.1} />
        </span>
      </div>
      <nav aria-label="主导航" className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
        {sections.map((section, sectionIndex) => (
          <div key={section.title} className={cn(sectionIndex > 0 && "border-t border-rail-line pt-3")}>
            <p className="sr-only">{section.title}</p>
            <div className="flex flex-col gap-1">
              {section.items.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  title={label}
                  className={({ isActive }) =>
                    cn(
                      "flex h-14 flex-col items-center justify-center gap-1 rounded-btn px-1 text-center transition-colors",
                      isActive
                        ? "bg-primary/16 text-rail-ink"
                        : "text-rail-ink-2 hover:bg-white/6 hover:text-rail-ink",
                    )
                  }
                >
                  <Icon size={19} strokeWidth={1.8} aria-hidden />
                  <span className="max-w-full truncate text-2xs leading-none">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </>
  );
}
