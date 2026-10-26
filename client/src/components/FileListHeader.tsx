import { Fragment } from "react";
import type { CSSProperties } from "react";
import { ArrowDown, ArrowUp, Check, Columns3, EyeOff, ListFilter } from "lucide-react";
import { flexRender } from "@tanstack/react-table";
import { FILE_COLUMNS } from "../hooks/useFileTable";
import type { FileTable } from "../hooks/useFileTable";
import { SearchInput } from "./SearchInput";
import { Button } from "./ui";

const TH = "select-none px-2 py-2 text-2xs font-semibold tracking-wide text-ink-3 uppercase";

/** 列显隐菜单条目：列 id → 文案（列本身由 table 的列模型提供） */
const VISIBILITY_ITEMS = [
  { id: FILE_COLUMNS.size, label: "大小列" },
  { id: FILE_COLUMNS.time, label: "修改时间列" },
] as const;

interface Props {
  nameFilter: string;
  onNameFilter: (value: string) => void;
  columnsOpen: boolean;
  onToggleColumns: () => void;
  onCloseColumns: () => void;
  /** 列模型：列宽 / 排序 / 列显隐都从这里读写 */
  table: FileTable;
  /** 与行共用的 grid 模板（两边同一份，保证表头与行的对齐） */
  gridStyle: CSSProperties;
  /** 恢复名称列默认宽度（双击拖拽手柄） */
  onResetNameWidth: () => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  dragging: boolean;
}

/** 名称过滤输入：列表与网格视图共用（网格没有表头，但同样需要即时过滤） */
export function NameFilterInput({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <SearchInput
      type="search"
      label="按名称过滤当前列表"
      placeholder="按名称过滤当前列表…"
      value={value}
      onChange={onChange}
      className={className}
      inputClassName="bg-surface-2"
    />
  );
}

/**
 * 列表头部：名称过滤 + 列显隐菜单 + 表头组（排序 / 拖拽调宽）。
 * 表头单元格与列宽模板都取自 table 的列模型，不再手写 th 类名与 grid 模板字符串。
 */
export function FileListHeader({
  nameFilter,
  onNameFilter,
  columnsOpen,
  onToggleColumns,
  onCloseColumns,
  table,
  gridStyle,
  onResetNameWidth,
  allSelected,
  someSelected,
  onToggleAll,
  dragging,
}: Props) {
  const sortIcon = (dir: false | "asc" | "desc") => {
    if (dir === "asc") return <ArrowUp size={12} aria-hidden />;
    if (dir === "desc") return <ArrowDown size={12} aria-hidden />;
    return null;
  };

  const sorted = table.state.sorting.length > 0;

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <NameFilterInput value={nameFilter} onChange={onNameFilter} className="w-56" />
        <div className="relative">
          <Button size="sm" variant="ghost" aria-expanded={columnsOpen} aria-haspopup="menu" onClick={onToggleColumns}>
            <Columns3 size={14} aria-hidden className="mr-1" />
            列显示
          </Button>
          {columnsOpen && (
            <div
              role="menu"
              className="absolute right-0 z-sticky mt-1 w-40 rounded-xl border border-line bg-surface-2 p-1 shadow-card"
            >
              {VISIBILITY_ITEMS.map((item) => {
                const column = table.getColumn(item.id);
                if (!column) return null;
                const visible = column.getIsVisible();
                return (
                  <label
                    key={item.id}
                    role="menuitemcheckbox"
                    aria-checked={visible}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink hover:bg-bg-sub"
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => column.toggleVisibility()}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    {visible ? (
                      <Check size={12} aria-hidden className="text-success-text" />
                    ) : (
                      <EyeOff size={12} aria-hidden className="text-ink-faint" />
                    )}
                    {item.label}
                  </label>
                );
              })}
              {sorted && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink hover:bg-bg-sub"
                  onClick={() => {
                    table.setSorting([]);
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

      {/* 内层保留 inline display:grid（gridStyle）；外层负责移动端隐藏，避免 inline style 覆盖 hidden */}
      <div className="hidden border-b border-line sm:block">
      <div className="grid" style={gridStyle} data-testid="file-list-header">
        {table.getHeaderGroups().map((group) => (
          <Fragment key={group.id}>
            {group.headers.map((header) => {
              const id = header.column.id;
              if (id === FILE_COLUMNS.select) {
                return (
                  <div key={header.id} className={`${TH} px-1`}>
                    <input
                      type="checkbox"
                      aria-label="全选"
                      aria-checked={someSelected && !allSelected ? "mixed" : allSelected}
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={onToggleAll}
                      disabled={dragging}
                      className="h-4 w-4 cursor-pointer accent-ink"
                    />
                  </div>
                );
              }
              if (id === FILE_COLUMNS.icon) return <div key={header.id} />;
              if (id === FILE_COLUMNS.actions) {
                return (
                  <div key={header.id} className={`${TH} text-right`}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </div>
                );
              }
              const align = id === FILE_COLUMNS.name ? "text-left" : "text-right";
              return (
                <div key={header.id} className={`relative ${TH} ${align}`}>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 hover:text-ink ${id === FILE_COLUMNS.name ? "" : "ml-auto"}`}
                    onClick={() => header.column.toggleSorting()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sortIcon(header.column.getIsSorted())}
                  </button>
                  {id === FILE_COLUMNS.name && (
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="调整名称列宽"
                      className="absolute top-0 -right-1.5 h-full w-1.5 cursor-col-resize hover:bg-accent/30"
                      onMouseDown={(e) => {
                        // 起止宽度都走列模型（header.getSize() / setColumnSizing），
                        // 监听挂在 window 上：与既有拖拽语义（160–960 夹取）保持一致
                        e.preventDefault();
                        const startX = e.clientX;
                        const startW = header.getSize();
                        document.body.style.cursor = "col-resize";
                        const onMove = (ev: MouseEvent) => {
                          const w = Math.min(960, Math.max(160, startW + ev.clientX - startX));
                          header.column.table.setColumnSizing({ [FILE_COLUMNS.name]: w });
                        };
                        const onUp = () => {
                          document.body.style.cursor = "";
                          window.removeEventListener("mousemove", onMove);
                          window.removeEventListener("mouseup", onUp);
                        };
                        window.addEventListener("mousemove", onMove);
                        window.addEventListener("mouseup", onUp);
                      }}
                      onDoubleClick={onResetNameWidth}
                    />
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      </div>
    </>
  );
}
