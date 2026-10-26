import { TIME_CHIPS, TYPE_CHIPS } from "../lib/fileFilters";
import type { TimeFilter, TypeFilter } from "../lib/fileFilters";

function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            className={
              active
                ? "rounded-chip border border-primary/25 bg-primary-soft px-3 py-1 text-xs font-medium text-primary-text transition-colors"
                : "rounded-chip border border-line bg-surface-1 px-3 py-1 text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            }
            onClick={() => onChange(value === o.value && !options.some((x) => x.value === "all") ? ("all" as T) : o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function TypeFilterChips({ value, onChange }: { value: TypeFilter; onChange: (v: TypeFilter) => void }) {
  return <FilterChips label="类型过滤" options={TYPE_CHIPS} value={value} onChange={onChange} />;
}

export function TimeFilterChips({ value, onChange }: { value: TimeFilter; onChange: (v: TimeFilter) => void }) {
  return <FilterChips label="时间过滤" options={TIME_CHIPS} value={value} onChange={onChange} />;
}
