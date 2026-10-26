import { Cloud } from "lucide-react";
import { NavItem } from "../components/ui";
import { sectionsFor } from "./nav";

/** 资料馆索引：品牌、空间语境、分组导航与底部账户/容量。 */
export function LibraryRail({
  workspaceName,
  isPlatformAdmin = false,
}: {
  workspaceName?: string;
  isPlatformAdmin?: boolean;
}) {
  const sections = sectionsFor(isPlatformAdmin);
  return (
    <>
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary text-ink-inverse shadow-soft"
          >
            <Cloud size={19} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-base font-bold tracking-tight text-ink">MStor</p>
            <p className="truncate text-2xs text-ink-3">私人资料工作室</p>
          </div>
        </div>
        {workspaceName && (
          <div className="mt-4 rounded-panel border border-line bg-surface-1 px-3 py-2.5">
            <p className="text-2xs text-ink-3">当前空间</p>
            <p className="truncate text-sm font-medium text-ink">{workspaceName}</p>
          </div>
        )}
      </div>

      <nav aria-label="主导航" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-1.5 text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase">
              {section.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map(({ to, label, Icon }) => (
                <NavItem key={to} to={to} end={to === "/"} icon={<Icon size={18} strokeWidth={1.75} />}>
                  {label}
                </NavItem>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </>
  );
}
