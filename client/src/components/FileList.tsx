import { useEffect, useMemo, useState } from "react";
import type * as React from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";
import type { FileTableRow } from "../hooks/useFileTable";
import { Copy, Download, FolderOpen } from "lucide-react";
import { contentUrl } from "../api/nodes";
import { FileGrid } from "./FileGrid";
import { FileRowCells } from "./FileRow";
import { FileListHeader } from "./FileListHeader";
import type { Node } from "../api/types";
import { compareNodes, useColumnPrefs } from "../hooks/useColumnPrefs";
import { useFileTable } from "../hooks/useFileTable";
import { hasNodeDrag, readNodeDrag, setNodeDrag } from "../lib/dnd";
import { Badge, EmptyState } from "./ui";
import { toast } from "./Toaster";
import VirtualizedList, { getRowHeight } from "./VirtualizedList";

/** 列表 ≥50 行启用虚拟滚动 */
const VIRTUAL_THRESHOLD = 50;

/** 未受控时的空选择集（引用稳定：行选择状态由它派生，避免每次渲染重发布） */
const EMPTY_SELECTED: ReadonlySet<string> = new Set();

/** 长按多选计时器：全局唯一（同一时刻只可能有一个手指在长按） */
let longPressTimer: number | null = null;

type DragHandlers = Pick<React.HTMLAttributes<HTMLElement>, "onDragStart" | "onDragEnd"> & { draggable?: boolean };
type DropHandlers = Pick<React.HTMLAttributes<HTMLElement>, "onDragOver" | "onDragLeave" | "onDrop">;

interface Props {
  nodes: Node[];
  onOpenDir: (id: string) => void;
  onOpenFile: (node: Node) => void;
  actions?: (node: Node) => ReactNode;
  emptyText?: string;
  /** 空目录 CTA（上传/新建），与「加载失败/搜索无结果」区分 */
  emptyActions?: ReactNode;
  /** 批量选择：显示行首 checkbox；单击行=选中（双击打开） */
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  /** Shift 点击行：锚点范围选择 */
  onSelectRange?: (id: string) => void;
  /** 点选行时同步键盘焦点（可选） */
  onRowFocus?: (index: number) => void;
  /** 视图形态：list 表格（默认）/ grid 网格卡片 */
  view?: "list" | "grid";
  /** 行/卡片右键菜单（桌面端） */
  onNodeContextMenu?: (e: ReactMouseEvent<HTMLElement>, node: Node) => void;
  /** 显示「已分享」Badge 的节点 id */
  sharedIds?: ReadonlySet<string>;
  /** 键盘导航：焦点行 ring 高亮 */
  focusIndex?: number;
  /** 键盘导航容器（ref + keydown，容器内 rows 带 data-file-row） */
  containerRef?: RefObject<HTMLDivElement | null>;
  onContainerKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
  /** 拖拽移动：节点拖放到文件夹行/面包屑（toDirId=""=根） */
  onDropMove?: (id: string, toDirId: string) => void;
}

// 紧凑行内图标按钮（h-7 w-7）：操作列专用，颜色由调用方传入
export function RowAction({
  label,
  tone = "neutral",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "neutral" | "blue" | "violet" | "amber" | "danger";
}) {
  const tones: Record<string, string> = {
    neutral: "text-ink-2 hover:bg-bg-sub hover:text-ink",
    blue: "text-primary-text hover:bg-blue-50",
    violet: "text-chip-violet-fg hover:bg-violet-50",
    amber: "text-warn-text hover:bg-warn-soft",
    danger: "text-danger-text hover:bg-danger-soft",
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${tones[tone]} ${className}`}
      {...rest}
    />
  );
}

export default function FileList({
  nodes,
  onOpenDir,
  onOpenFile,
  actions,
  emptyText = "该目录为空",
  emptyActions,
  selectable = false,
  selected = EMPTY_SELECTED,
  onToggle,
  onSelectRange,
  onRowFocus,
  view = "list",
  onNodeContextMenu,
  sharedIds,
  focusIndex,
  containerRef,
  onContainerKeyDown,
  onDropMove,
}: Props) {
  // 拖拽移动状态：拖拽中禁用选择；文件夹行 dragover 高亮
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // 列偏好：名称列宽 / 大小、时间列显隐 / 排序（localStorage 持久化）
  const { pref, setPrefAndSave, updatePref } = useColumnPrefs();
  const [colMenuOpen, setColMenuOpen] = useState(false);
  // 名称过滤（当前列表内即时过滤，会话级不持久化）
  const [nameFilter, setNameFilter] = useState("");

  // 移动端（<sm）压缩为 [选择][图标][名称][操作]，隐藏大小/时间列
  const [isSmall, setIsSmall] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 639px)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = (e: MediaQueryListEvent) => setIsSmall(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // 过滤 + 排序（文件夹置顶）
  const display = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    const filtered = q ? nodes.filter((n) => n.name.toLowerCase().includes(q)) : nodes;
    if (!pref.sort) return filtered;
    const dir = pref.sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => compareNodes(a, b, pref.sort!.key, dir));
  }, [nodes, nameFilter, pref.sort]);

  // 列模型：列宽 / 排序 / 列显隐 / 选择收敛到 table，表头与行共用同一份 grid 模板
  const { table, gridStyle } = useFileTable({
    nodes: display,
    pref,
    onPrefChange: setPrefAndSave,
    selected,
    onToggle,
    selectable: !!selectable,
    compact: isSmall,
  });
  const rows = table.getRowModel().rows;

  if (!nodes.length) return <EmptyState icon={FolderOpen} title={emptyText} action={emptyActions} />;

  const open = (n: Node) => (n.is_dir ? onOpenDir(n.id) : onOpenFile(n));
  const virtual = view === "list" && display.length >= VIRTUAL_THRESHOLD;
  // 入场动画仅小列表（≤10 项，stagger 20ms）
  const animate = display.length <= 10 && !virtual;

  // 行单击：selectable 时切换选中（Shift=范围），双击打开；不可选时单击打开
  const rowClick = (n: Node, i: number) => (e: ReactMouseEvent) => {
    if (draggingId) return;
    onRowFocus?.(i);
    if (selectable && onToggle) {
      if (e.shiftKey && onSelectRange) {
        e.preventDefault();
        onSelectRange(n.id);
        return;
      }
      e.preventDefault();
      onToggle(n.id);
      return;
    }
    open(n);
  };
  const rowDoubleClick = (n: Node, i: number) => (e: ReactMouseEvent) => {
    e.preventDefault();
    onRowFocus?.(i);
    open(n);
  };

  // 行首 checkbox：行内独立控件，点击不冒泡触发行选择
  const checkbox = (n: Node, cls = "") =>
    selectable && onToggle ? (
      <input
        type="checkbox"
        aria-label={`选择 ${n.name}`}
        checked={selected.has(n.id)}
        disabled={!!draggingId}
        onChange={() => onToggle(n.id)}
        onClick={(e) => e.stopPropagation()}
        className={`h-4 w-4 shrink-0 cursor-pointer accent-emerald-600 ${cls}`}
      />
    ) : null;

  // 表头全选：当前列表全选/清除（再次点击取反）
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (!onToggle || draggingId) return;
    for (const r of rows) {
      if (allSelected ? selected.has(r.id) : !selected.has(r.id)) onToggle(r.id);
    }
  };

  // 键盘焦点行 / 拖拽悬停行高亮（2px 主色）
  const rowCls = (i: number, n: Node) =>
    [
      focusIndex === i ? "ring-2 ring-primary" : "",
      dragOverId === n.id ? "ring-2 ring-primary" : "",
      selected.has(n.id) && selectable ? "bg-primary-soft/60" : "",
    ]
      .filter(Boolean)
      .join(" ");

  // drop 悬停底色（inline 样式避免与行响应式背景类冲突）
  const dropHoverStyle = (n: Node): CSSProperties =>
    dragOverId === n.id ? { backgroundColor: "var(--color-primary-soft)" } : {};

  const dragProps = (n: Node): DragHandlers =>
    onDropMove
      ? {
          draggable: true,
          onDragStart: (e: ReactDragEvent<HTMLElement>) => {
            setNodeDrag(e.dataTransfer, n);
            setDraggingId(n.id);
          },
          onDragEnd: () => {
            setDraggingId(null);
            setDragOverId(null);
          },
        }
      : {};

  // 文件夹行/卡是放置目标：仅接受节点拖拽（OS 文件拖入仍走上传）
  const folderDropProps = (n: Node): DropHandlers =>
    onDropMove && n.is_dir
      ? {
          onDragOver: (e: ReactDragEvent<HTMLElement>) => {
            if (!hasNodeDrag(e.dataTransfer) || draggingId === n.id) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOverId((cur) => (cur === n.id ? cur : n.id));
          },
          onDragLeave: () => setDragOverId((cur) => (cur === n.id ? null : cur)),
          onDrop: (e: ReactDragEvent<HTMLElement>) => {
            const payload = readNodeDrag(e.dataTransfer);
            setDragOverId(null);
            if (!payload || payload.id === n.id) return;
            e.preventDefault();
            e.stopPropagation();
            onDropMove(payload.id, n.id);
          },
        }
      : {};

  const sharedBadge = (n: Node) => (sharedIds?.has(n.id) ? <Badge tone="accent">已分享</Badge> : null);
  // 入场不做逐行延迟：长列表会形成波浪，且每行一个动画等于每行一次合成
  const animStyle = (_i: number): CSSProperties => ({});

  const copyName = (n: Node) => {
    void navigator.clipboard?.writeText(n.name);
    toast("文件名已复制", "info");
  };

  // 操作列：下载（蓝）/ 外部 actions（分享紫、重命名中性、移动琥珀、删除红）。
  // 始终显示（不随 hover 隐藏），按钮组并列居中；点击/双击阻断冒泡：不触发行选择或行打开
  const actionCell = (n: Node) => (
    <span
      className="flex shrink-0 items-center justify-center gap-0.5 px-1"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {!n.is_dir && (
        <a
          href={contentUrl(n.id, true)}
          aria-label={`下载 ${n.name}`}
          title={`下载 ${n.name}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-primary-text transition-colors hover:bg-blue-50"
        >
          <Download size={14} aria-hidden />
        </a>
      )}
      {actions?.(n)}
    </span>
  );

  const listHeader = (
    <FileListHeader
      view={view}
      nameFilter={nameFilter}
      onNameFilter={setNameFilter}
      columnsOpen={colMenuOpen}
      onToggleColumns={() => setColMenuOpen((v) => !v)}
      onCloseColumns={() => setColMenuOpen(false)}
      table={table}
      gridStyle={gridStyle}
      onResetNameWidth={() => updatePref((p) => ({ ...p, nameW: undefined }))}
      allSelected={allSelected}
      onToggleAll={toggleAll}
      dragging={!!draggingId}
    />
  );
  // 行内容（grid 子元素，与表头同模板对齐）
  const rowCells = (row: FileTableRow) => {
    const n = row.original;
    return (
      <FileRowCells
        row={row}
        selectable={!!selectable}
        checkboxEl={selectable ? checkbox(n) : null}
        copyButton={
          <RowAction
            label={`复制文件名 ${n.name}`}
            className="h-6 w-6 opacity-60 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              copyName(n);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Copy size={12} aria-hidden />
          </RowAction>
        }
        badge={sharedBadge(n)}
        actionCell={actionCell(n)}
      />
    );
  };
  const cancelLongPress = () => {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };
  const touchSelectProps = (n: Node) =>
    selectable && onToggle
      ? {
          onTouchStart: () => {
            cancelLongPress();
            longPressTimer = window.setTimeout(() => {
              longPressTimer = null;
              onToggle(n.id);
            }, 500);
          },
          onTouchEnd: cancelLongPress,
          onTouchMove: cancelLongPress,
          onTouchCancel: cancelLongPress,
        }
      : {};

  const rowEvents = (n: Node, _i: number) => ({
    onContextMenu: (e: ReactMouseEvent<HTMLElement>) => onNodeContextMenu?.(e, n),
    ...touchSelectProps(n),
    ...dragProps(n),
    ...folderDropProps(n),
  });

  // 虚拟行内容（绝对定位 + translateY，同 grid 模板）
  const virtualRow = (row: FileTableRow, i: number, top: number) => {
    const n = row.original;
    return (
      <div
        data-file-row={i}
        tabIndex={-1}
        role="row"
        className={`group absolute inset-x-0 top-0 rounded-lg px-2 text-sm hover:bg-bg-sub ${rowCls(i, n)}`}
        style={{ height: getRowHeight(), transform: `translateY(${top}px)`, ...gridStyle, ...dropHoverStyle(n) }}
        onClick={rowClick(n, i)}
        onDoubleClick={rowDoubleClick(n, i)}
        {...rowEvents(n, i)}
      >
        {rowCells(row)}
      </div>
    );
  };

  if (view === "grid") {
    return (
      <FileGrid
        nodes={display}
        containerRef={containerRef}
        onContainerKeyDown={onContainerKeyDown}
        cellClass={(i, n) => `group relative overflow-hidden rounded-card border border-line bg-white shadow-card ${rowCls(i, n)} ${animate ? "anim-item-in" : ""}`}
        cellStyle={(i, n) => ({ ...animStyle(i), ...dropHoverStyle(n) })}
        onClick={rowClick}
        onDoubleClick={rowDoubleClick}
        onContextMenu={onNodeContextMenu}
        dragProps={dragProps}
        dropProps={folderDropProps}
        overlay={(n) => (selectable ? checkbox(n, "absolute top-2 left-2 z-content") : null)}
        badge={sharedBadge}
      />
    );
  }

  const listBody = (
    <div className="relative">
      {rows.map((row, i) => {
        const n = row.original;
        return (
          <div
            key={row.id}
            data-file-row={i}
            tabIndex={-1}
            role="row"
            className={`group border-b border-line/70 text-sm hover:bg-bg-sub ${i % 2 === 1 ? "bg-bg-sub/40" : ""} ${rowCls(i, n)} ${animate ? "anim-item-in" : ""}`}
            style={{ ...gridStyle, height: getRowHeight(), padding: "0 8px", ...animStyle(i), ...dropHoverStyle(n) }}
            onClick={rowClick(n, i)}
            onDoubleClick={rowDoubleClick(n, i)}
            {...rowEvents(n, i)}
          >
            {rowCells(row)}
          </div>
        );
      })}
    </div>
  );

  if (virtual) {
    return (
      <div
        ref={containerRef}
        data-testid="file-list-container"
        tabIndex={0}
        onKeyDown={onContainerKeyDown}
        className="md:flex md:min-h-0 md:flex-1 md:flex-col"
      >
        {listHeader}

        <VirtualizedList
          nodes={display}
          focusIndex={focusIndex}
          row={(_n, index, top) => virtualRow(rows[index]!, index, top)}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} data-testid="file-list-container" tabIndex={0} onKeyDown={onContainerKeyDown}>
      {listHeader}

      {listBody}
    </div>
  );
}
