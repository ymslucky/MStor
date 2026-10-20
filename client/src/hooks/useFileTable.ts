import { useMemo } from "react";
import type { CSSProperties } from "react";
import {
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type {
  ColumnDef,
  ColumnSizingState,
  ColumnVisibilityState,
  Row,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import type { Node } from "../api/types";
import type { ColPref, SortKey } from "./useColumnPrefs";

/** 列 id：表头、行、grid 模板三处共用一份，不再各自手写顺序 */
export const FILE_COLUMNS = {
  select: "select",
  icon: "icon",
  name: "name",
  size: "size",
  time: "updated_at",
  actions: "actions",
} as const;

/** 名称列默认宽度（与旧 pref.nameW 缺省值一致） */
export const DEFAULT_NAME_W = 320;

/**
 * 表列能力：排序（表头三态）/ 列显隐（大小、时间）/ 列宽（名称拖拽）/ 选择。
 * 注册 sortedRowModel 以满足排序态，但数据顺序仍由调用方给（manualSorting）：
 * 「文件夹始终置顶且不随方向翻转」是旧 compareNodes 的既有语义，交给数据侧保持。
 */
const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

export type FileTableFeatures = typeof features;
export type FileTable = ReturnType<typeof useFileTable>["table"];
export type FileTableRow = Row<FileTableFeatures, Node>;

function nodeColumns(selectable: boolean): ColumnDef<FileTableFeatures, Node>[] {
  const columns: ColumnDef<FileTableFeatures, Node>[] = [];
  if (selectable) columns.push({ id: FILE_COLUMNS.select, size: 28, enableSorting: false, enableResizing: false });
  columns.push({ id: FILE_COLUMNS.icon, size: 26, enableSorting: false, enableResizing: false });
  columns.push({
    id: FILE_COLUMNS.name,
    accessorFn: (n: Node) => n.name,
    header: "名称",
    size: DEFAULT_NAME_W,
    minSize: 140,
    maxSize: 960,
    enableResizing: true,
  });
  columns.push({
    id: FILE_COLUMNS.size,
    accessorFn: (n: Node) => n.size ?? 0,
    header: "大小",
    size: 92,
    enableResizing: false,
  });
  columns.push({
    id: FILE_COLUMNS.time,
    accessorFn: (n: Node) => n.updated_at,
    header: "修改时间",
    size: 170,
    enableResizing: false,
  });
  columns.push({ id: FILE_COLUMNS.actions, header: "操作", size: 120, enableSorting: false, enableResizing: false });
  return columns;
}

/** 表头与行共用的 grid 模板：列数、顺序、宽度都来自同一份列模型 */
function fileGridTemplate(
  columns: readonly { id: string; size: number }[],
  compact: boolean,
  nameFlex: boolean,
): string {
  return columns
    .map((c) => {
      // 名称列：未手动调宽时吃满剩余空间（迁移前的既有观感）；调宽后按列模型给的 px
      if (c.id === FILE_COLUMNS.name)
        return compact ? "minmax(0, 1fr)" : nameFlex ? "minmax(140px, 1fr)" : `minmax(140px, ${c.size}px)`;
      if (c.id === FILE_COLUMNS.actions) return "auto";
      return `${c.size}px`;
    })
    .join(" ");
}

type SortingUpdater = SortingState | ((prev: SortingState) => SortingState);
type VisibilityUpdater = ColumnVisibilityState | ((prev: ColumnVisibilityState) => ColumnVisibilityState);
type SizingUpdater = ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState);
type SelectionUpdater = RowSelectionState | ((prev: RowSelectionState) => RowSelectionState);

const resolve = <T>(updater: T | ((prev: T) => T), prev: T): T =>
  typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;

interface Options {
  /** 已按名称过滤 + 排序的节点（顺序即行序） */
  nodes: Node[];
  /** 列偏好：显隐 / 名称列宽 / 排序（localStorage 持久化壳仍是 useColumnPrefs） */
  pref: ColPref;
  onPrefChange: (next: ColPref) => void;
  /** 外部选择源（useFileSelection 的 Set），rowSelection 由它派生 */
  selected: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  selectable: boolean;
  /** 移动端紧凑布局：隐藏大小/时间列，名称列吃满剩余宽度 */
  compact: boolean;
}

/**
 * 文件列表的列模型：列宽 / 排序 / 列显隐 / 选择状态收敛到 table，
 * 表头与行共用同一份 grid 模板（本次迁移的核心收益）。
 */
export function useFileTable({ nodes, pref, onPrefChange, selected, onToggle, selectable, compact }: Options) {
  const sorting = useMemo<SortingState>(
    () => (pref.sort ? [{ id: pref.sort.key, desc: pref.sort.dir === "desc" }] : []),
    [pref.sort],
  );
  const columnVisibility = useMemo<ColumnVisibilityState>(
    () => ({ [FILE_COLUMNS.size]: !!pref.showSize && !compact, [FILE_COLUMNS.time]: !!pref.showTime && !compact }),
    [pref.showSize, pref.showTime, compact],
  );
  const columnSizing = useMemo<ColumnSizingState>(
    () => ({ [FILE_COLUMNS.name]: pref.nameW ?? DEFAULT_NAME_W }),
    [pref.nameW],
  );
  const rowSelection = useMemo<RowSelectionState>(() => {
    const next: RowSelectionState = {};
    for (const id of selected) next[id] = true;
    return next;
  }, [selected]);
  const columns = useMemo(() => nodeColumns(selectable), [selectable]);

  const table = useTable<FileTableFeatures, Node>({
    features,
    data: nodes,
    columns,
    state: { sorting, columnVisibility, columnSizing, rowSelection },
    manualSorting: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    enableRowSelection: selectable,
    getRowId: (n: Node) => n.id,
    onSortingChange: (updater: SortingUpdater) => {
      const next = resolve(updater, sorting);
      const first = next[0];
      onPrefChange({ ...pref, sort: first ? { key: first.id as SortKey, dir: first.desc ? "desc" : "asc" } : null });
    },
    onColumnVisibilityChange: (updater: VisibilityUpdater) => {
      const next = resolve(updater, columnVisibility);
      // 移动端（compact）本就折叠大小/时间列：pref 在这些列上保持 true，不被布局差异污染
      onPrefChange({
        ...pref,
        showSize: compact || next[FILE_COLUMNS.size] !== false,
        showTime: compact || next[FILE_COLUMNS.time] !== false,
      });
    },
    onColumnSizingChange: (updater: SizingUpdater) => {
      const next = resolve(updater, columnSizing);
      onPrefChange({ ...pref, nameW: next[FILE_COLUMNS.name] });
    },
    onRowSelectionChange: (updater: SelectionUpdater) => {
      if (!onToggle) return;
      const next = resolve(updater, rowSelection);
      for (const id of new Set([...Object.keys(rowSelection), ...Object.keys(next)])) {
        if (!!rowSelection[id] !== !!next[id]) onToggle(id);
      }
    },
  });

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: fileGridTemplate(
      table.getVisibleLeafColumns().map((c) => ({ id: c.id, size: c.getSize() })),
      compact,
      pref.nameW === undefined,
    ),
    alignItems: "center",
  };

  return { table, gridStyle };
}
