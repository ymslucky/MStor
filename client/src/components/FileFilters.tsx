// 目录工具栏过滤 chips：类型/时间两组，纯前端过滤当前列表
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
  const idle = "rounded-md border border-line bg-surface-1 px-2 py-1 text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink";
  const active = "rounded-md border border-primary/35 bg-primary-soft px-2 py-1 text-xs font-medium text-primary-text";
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={value === o.value ? active : idle}
          onClick={() => onChange(value === o.value && !options.some((x) => x.value === "all") ? ("all" as T) : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TypeFilterChips({ value, onChange }: { value: TypeFilter; onChange: (v: TypeFilter) => void }) {
  return <FilterChips label="类型过滤" options={TYPE_CHIPS} value={value} onChange={onChange} />;
}

export function TimeFilterChips({ value, onChange }: { value: TimeFilter; onChange: (v: TimeFilter) => void }) {
  return <FilterChips label="时间过滤" options={TIME_CHIPS} value={value} onChange={onChange} />;
}