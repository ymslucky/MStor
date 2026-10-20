import type { CSSProperties } from "react";
import { ArrowDown, ArrowUp, Check, Columns3, EyeOff, ListFilter, Search } from "lucide-react";
import type { ColPref, SortKey } from "../hooks/useColumnPrefs";
import { Button } from "./ui";

interface Props {
  /** 只在列表视图渲染 */
  view?: "list" | "grid";
  nameFilter: string;
  onNameFilter: (value: string) => void;
  columnsOpen: boolean;
  onToggleColumns: () => void;
  onCloseColumns: () => void;
  pref: ColPref;
  onChangePref: (next: ColPref) => void;
  onWidthChange: (updater: (prev: ColPref) => ColPref) => void;
  onSort: (key: SortKey) => void;
  showSize: boolean;
  showTime: boolean;
  gridStyle: CSSProperties;
  selectable?: boolean;
  allSelected: boolean;
  onToggleAll: () => void;
  dragging: boolean;
}

const thCls = "select-none px-2 py-2 text-center text-xs font-medium text-ink-faint";

/**
 * 列表头部：名称过滤 + 列显隐菜单 + 可排序表头 + 名称列拖拽调宽。
 * 从 FileList 抽出——它是"列表配置与显示"的 UI，与虚拟滚动/选择/拖拽移动无关。
 */
export function FileListHeader({
  view,
  nameFilter,
  onNameFilter,
  columnsOpen,
  onToggleColumns,
  onCloseColumns,
  pref,
  onChangePref,
  onWidthChange,
  onSort,
  showSize,
  showTime,
  gridStyle,
  selectable,
  allSelected,
  onToggleAll,
  dragging,
}: Props) {
  if (view !== "list") return null;

  const sortIcon = (key: SortKey) => {
    const s = pref.sort;
    if (!s || s.key !== key) return null;
    return s.dir === "asc" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />;
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = pref.nameW ?? 320;
    document.body.style.cursor = "col-resize";
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(960, Math.max(160, startW + ev.clientX - startX));
      onWidthChange((p) => ({ ...p, nameW: w }));
    };
    const onUp = () => {
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="relative">
          <Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={nameFilter}
            onChange={(e) => onNameFilter(e.target.value)}
            placeholder="按名称过滤当前列表…"
            aria-label="按名称过滤当前列表"
            className="h-8 w-56 rounded-lg border border-line bg-white pl-8 pr-2 text-xs text-ink placeholder:text-ink-faint focus:border-accent/50 focus:outline-none"
          />
        </div>
        <div className="relative">
          <Button size="sm" variant="ghost" aria-expanded={columnsOpen} aria-haspopup="menu" onClick={onToggleColumns}>
            <Columns3 size={14} aria-hidden className="mr-1" />
            列显示
          </Button>
          {columnsOpen && (
            <div role="menu" className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-line bg-white p-1 shadow-card">
              {(
                [
                  { key: "showSize", label: "大小列" },
                  { key: "showTime", label: "修改时间列" },
                ] as const
              ).map((c) => (
                <label
                  key={c.key}
                  role="menuitemcheckbox"
                  aria-checked={pref[c.key]}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink hover:bg-bg-sub"
                >
                  <input
                    type="checkbox"
                    checked={pref[c.key]}
                    onChange={() => onChangePref({ ...pref, [c.key]: !pref[c.key] })}
                    className="h-3.5 w-3.5 accent-emerald-600"
                  />
                  {pref[c.key] ? (
                    <Check size={12} aria-hidden className="text-success-text" />
                  ) : (
                    <EyeOff size={12} aria-hidden className="text-ink-faint" />
                  )}
                  {c.label}
                </label>
              ))}
              {pref.sort && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink hover:bg-bg-sub"
                  onClick={() => {
                    onChangePref({ ...pref, sort: null });
                    onCloseColumns();
                  }}
                >
                  <ListFilter size={12} aria-hidden />
                  恢复默认排序
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="hidden border-b border-line sm:grid" style={gridStyle} data-testid="file-list-header">
        {selectable && (
          <div className="px-1 py-2 text-center">
            <input
              type="checkbox"
              aria-label="全选"
              checked={allSelected}
              onChange={onToggleAll}
              disabled={dragging}
              className="h-4 w-4 cursor-pointer accent-emerald-600"
            />
          </div>
        )}
        <div />
        <div className={`relative ${thCls}`}>
          <button type="button" className="mx-auto inline-flex items-center gap-1 hover:text-ink" onClick={() => onSort("name")}>
            名称 {sortIcon("name")}
          </button>
          <span
            role="separator"
            aria-orientation="vertical"
            aria-label="调整名称列宽"
            className="absolute top-0 -right-1.5 h-full w-1.5 cursor-col-resize hover:bg-accent/30"
            onMouseDown={startResize}
            onDoubleClick={() => onChangePref({ ...pref, nameW: undefined })}
          />
        </div>
        {showSize && (
          <div className={thCls}>
            <button type="button" className="mx-auto inline-flex items-center gap-1 hover:text-ink" onClick={() => onSort("size")}>
              大小 {sortIcon("size")}
            </button>
          </div>
        )}
        {showTime && (
          <div className={thCls}>
            <button type="button" className="mx-auto inline-flex items-center gap-1 hover:text-ink" onClick={() => onSort("updated_at")}>
              修改时间 {sortIcon("updated_at")}
            </button>
          </div>
        )}
        <div className={thCls}>操作</div>
      </div>
    </>
  );
}
