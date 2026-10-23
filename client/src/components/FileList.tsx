import { useEffect, useMemo, useRef, useState } from "react";
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
import { Copy, Download, FolderOpen, Link2, MoreHorizontal } from "lucide-react";
import { contentUrl } from "../api/nodes";
import { FileGrid } from "./FileGrid";
import { FileRowCells } from "./FileRow";
import { FileListHeader, NameFilterInput } from "./FileListHeader";
import type { Node } from "../api/types";
import { compareNodes, useColumnPrefs } from "../hooks/useColumnPrefs";
import { useFileTable } from "../hooks/useFileTable";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  COARSE_POINTER_MEDIA_QUERY,
  COMPACT_MEDIA_QUERY,
  LONG_PRESS_CLICK_GUARD_MS,
  LONG_PRESS_MS,
  VIRTUAL_THRESHOLD,
} from "../lib/constants";
import { hasNodeDrag, readNodeDrag, setNodeDrag } from "../lib/dnd";
import { Pill, EmptyState } from "./ui";
import { toast } from "./Toaster";
import VirtualizedList, { getRowHeight } from "./VirtualizedList";
import { RowAction } from "./RowAction";

/** 未受控时的空选择集（引用稳定：行选择状态由它派生，避免每次渲染重发布） */
const EMPTY_SELECTED: ReadonlySet<string> = new Set();

/** 长按多选计时器：全局唯一（同一时刻只可能有一个手指在长按） */
let longPressTimer: number | null = null;
/** 本轮触摸是否已触发长按（松手时把点击抑制窗口从松手时刻重新计时） */
let longPressFired = false;
/** 最近一次长按完成的时间：用于抑制长按后浏览器补发的 click（否则会立刻打开） */
let lastLongPressAt = 0;

type DragHandlers = Pick<React.HTMLAttributes<HTMLElement>, "onDragStart" | "onDragEnd"> & { draggable?: boolean };
type DropHandlers = Pick<React.HTMLAttributes<HTMLElement>, "onDragOver" | "onDragLeave" | "onDrop">;

interface Props {
  nodes: Node[];
  onOpenDir: (id: string) => void;
  onOpenFile: (node: Node) => void;
  actions?: (node: Node) => ReactNode;
  /** 网格视图的右上角操作组（默认复用 actions；只读列表可给不同动作，如回收站的恢复/彻底删除） */
  gridActions?: (node: Node) => ReactNode;
  emptyText?: string;
  /** 空目录 CTA（上传/新建），与「加载失败/搜索无结果」区分 */
  emptyActions?: ReactNode;
  /** 触屏单击是否打开节点：只读列表（如回收站）没有打开语义，设为 false 时回落为选择 */
  tapOpens?: boolean;
  /** 批量选择：显示行首 checkbox；桌面单击=选中（双击打开）/ 触屏单击=打开（长按选中） */
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
  /** 显示「已分享」Pill 的节点 id */
  sharedIds?: ReadonlySet<string>;
  /** 键盘导航：焦点行 ring 高亮 */
  focusIndex?: number;
  /** 键盘导航容器（ref + keydown，容器内 rows 带 data-file-row） */
  containerRef?: RefObject<HTMLDivElement | null>;
  onContainerKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
  /** 拖拽移动：节点拖放到文件夹行/面包屑（toDirId=""=根） */
  onDropMove?: (id: string, toDirId: string) => void;
  /** 空白区域框选：替换当前选择（ids 为命中的节点 id） */
  onSetSelection?: (ids: string[]) => void;
  /** 关键操作：分享（列表桌面端直接展示，其余动作进「更多」） */
  onShare?: (node: Node) => void;
  /** 移动端「更多」菜单：由页面提供菜单渲染（桌面仍显示完整行内操作） */
  onMoreMenu?: (node: Node, rect: DOMRect) => void;
}

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 文件列表：只负责「行布局 + 行契约（role=row / data-file-row）+ 拖拽/选择事件绑定」。
 * 过滤、排序、列偏好、虚拟化分别由 useColumnPrefs / useFileTable / VirtualizedList 承担，
 * 名称过滤留在本组件但状态不外泄（过滤后的行序即渲染与键盘导航的行序）。
 */
export default function FileList({
  nodes,
  onOpenDir,
  onOpenFile,
  actions,
  gridActions,
  emptyText = "该目录为空",
  emptyActions,
  selectable = false,
  selected = EMPTY_SELECTED,
  onToggle,
  onSelectRange,
  onRowFocus,
  tapOpens = true,
  view = "list",
  onNodeContextMenu,
  sharedIds,
  focusIndex,
  containerRef,
  onContainerKeyDown,
  onDropMove,
  onMoreMenu,
  onSetSelection,
  onShare,
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
  const isSmall = useMediaQuery(COMPACT_MEDIA_QUERY);
  // 触屏：单击行=打开（双击在触屏不可靠），长按=进入多选
  const coarsePointer = useMediaQuery(COARSE_POINTER_MEDIA_QUERY);

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

  // 框选：只在空白区域按下鼠标，避免和行拖拽移动冲突
  const areaRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const marqueeCleanup = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      marqueeCleanup.current?.();
    },
    [],
  );

  if (!nodes.length) return <EmptyState icon={FolderOpen} title={emptyText} action={emptyActions} />;

  const open = (n: Node) => (n.is_dir ? onOpenDir(n.id) : onOpenFile(n));
  const virtual = view === "list" && display.length >= VIRTUAL_THRESHOLD;
  // 入场动画仅小列表（≤10 项，stagger 20ms）
  const animate = display.length <= 10 && !virtual;

  // 行单击：桌面=选中（Shift=范围），双击打开；触屏=单击打开（长按选中）。
  // 长按结束会补发一次 click，用时间戳抑制，避免选中后又被打开。
  const rowClick = (n: Node, i: number) => (e: ReactMouseEvent) => {
    if (draggingId) return;
    if (Date.now() - lastLongPressAt < LONG_PRESS_CLICK_GUARD_MS) {
      lastLongPressAt = 0;
      e.preventDefault();
      return;
    }
    onRowFocus?.(i);
    if (selectable && onToggle) {
      // 触屏单击=打开；只读列表（回收站）没有「打开」语义，回落为选择
      if (coarsePointer && tapOpens) {
        open(n);
        return;
      }
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
        className={`h-4 w-4 shrink-0 cursor-pointer accent-ink ${cls}`}
      />
    ) : null;

  // 表头全选：当前列表全选/清除（再次点击取反）
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id));
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
      selected.has(n.id) && selectable
        ? "bg-ink/5 shadow-[inset_3px_0_0_var(--color-ink)] hover:bg-ink/10"
        : "hover:bg-bg-sub/70",
    ]
      .filter(Boolean)
      .join(" ");

  const startMarquee = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!selectable || !onSetSelection || e.button !== 0 || coarsePointer || marqueeCleanup.current) return;
    const target = e.target as Element;
    if (target.closest("[data-file-row], button, a, input, select, textarea, label, [data-testid='file-list-header']")) {
      return;
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const base = new Set(selected);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const previousUserSelect = document.body.style.userSelect;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      if (!moved && Math.max(Math.abs(ev.clientX - startX), Math.abs(ev.clientY - startY)) < 4) return;
      moved = true;
      document.body.style.userSelect = "none";
      const left = Math.min(startX, ev.clientX);
      const top = Math.min(startY, ev.clientY);
      const right = Math.max(startX, ev.clientX);
      const bottom = Math.max(startY, ev.clientY);
      setMarquee({ left, top, width: right - left, height: bottom - top });

      const hit: string[] = [];
      for (const el of areaRef.current?.querySelectorAll<HTMLElement>("[data-node-id]") ?? []) {
        const r = el.getBoundingClientRect();
        if (r.right < left || r.left > right || r.bottom < top || r.top > bottom) continue;
        const id = el.dataset.nodeId;
        if (id) hit.push(id);
      }
      const next = additive ? new Set([...base, ...hit]) : new Set(hit);
      onSetSelection([...next]);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = previousUserSelect;
      marqueeCleanup.current = null;
      setMarquee(null);
      // 空白处单击（没有拖动）清空选择；Shift 空白点击保留原选择
      if (!moved && !additive) onSetSelection([]);
    };

    marqueeCleanup.current = onUp;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  // 网格选中态：卡片自带 bg-surface-1，背景 tint 会被 CSS 顺序覆盖（构建产物中 surface-1 在 primary-soft/60 之后），
  // 因此网格改用「描边 + ring」表达选中，与底色解耦
  const gridCellClass = (i: number, n: Node) =>
    [
      "group relative overflow-hidden rounded-card border border-line bg-surface-1 transition-colors select-none [-webkit-touch-callout:none] hover:border-line-strong",
      focusIndex === i ? "ring-2 ring-primary" : "",
      dragOverId === n.id ? "ring-2 ring-primary" : "",
      selected.has(n.id) && selectable ? "border-ink ring-2 ring-ink/25 hover:border-ink" : "",
      animate ? "anim-item-in" : "",
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

  const sharedBadge = (n: Node) => (sharedIds?.has(n.id) ? <Pill tone="accent">已分享</Pill> : null);

  const copyName = (n: Node) => {
    void navigator.clipboard?.writeText(n.name);
    toast("文件名已复制", "info");
  };

  // 操作列：下载（蓝）/ 外部 actions（分享紫、重命名中性、移动琥珀、删除红）。
  // 始终显示（不随 hover 隐藏），按钮组并列居中；点击/双击阻断冒泡：不触发行选择或行打开
  const actionCell = (n: Node) => {
    const download =
      n.is_dir ? null : (
        <a
          href={contentUrl(n.id, true)}
          aria-label={`下载 ${n.name}`}
          title={`下载 ${n.name}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-primary-text transition-colors hover:bg-primary-soft"
        >
          <Download size={14} aria-hidden />
        </a>
      );
    return (
      <span
        className="flex shrink-0 items-center justify-end gap-0.5 px-1"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {onMoreMenu ? (
          <>
            {/* 关键动作直接展示：文件「下载 + 分享」，文件夹「分享」；移动端仅下载+更多，把宽度让给文件名 */}
            {download}
            {onShare && (
              <RowAction
                label={`分享 ${n.name}`}
                tone="violet"
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(n);
                }}
              >
                <Link2 size={14} aria-hidden />
              </RowAction>
            )}
            {/* 次要动作（收藏/重命名/移动/标签/删除…）全部收进更多 */}
            <RowAction
              label={`更多操作 ${n.name}`}
              className="tap"
              onClick={(e) => {
                e.stopPropagation();
                onMoreMenu(n, e.currentTarget.getBoundingClientRect());
              }}
            >
              <MoreHorizontal size={16} aria-hidden />
            </RowAction>
          </>
        ) : (
          <>
            {download}
            {actions?.(n)}
          </>
        )}
      </span>
    );
  };

  const withMarquee = (content: ReactNode) => (
    <div
      ref={areaRef}
      data-testid="file-list-area"
      className="contents"
      onMouseDown={startMarquee}
    >
      {content}
      {marquee && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-content rounded-sm border border-ink/40 bg-ink/5"
          style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
        />
      )}
    </div>
  );

  const listHeader = (
    <FileListHeader
      nameFilter={nameFilter}
      onNameFilter={setNameFilter}
      columnsOpen={colMenuOpen}
      onToggleColumns={() => setColMenuOpen((v) => !v)}
      onCloseColumns={() => setColMenuOpen(false)}
      table={table}
      gridStyle={gridStyle}
      onResetNameWidth={() => updatePref((p) => ({ ...p, nameW: undefined }))}
      allSelected={allSelected}
      someSelected={someSelected}
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
    // 松手/移动结束时重置抑制窗口：长按可能持续数秒，窗口必须从结束时刻算起
    if (longPressFired) {
      lastLongPressAt = Date.now();
      longPressFired = false;
    }
  };
  const touchSelectProps = (n: Node) =>
    selectable && onToggle
      ? {
          onTouchStart: () => {
            cancelLongPress();
            longPressTimer = window.setTimeout(() => {
              longPressTimer = null;
              longPressFired = true;
              onToggle(n.id);
            }, LONG_PRESS_MS);
          },
          onTouchEnd: cancelLongPress,
          onTouchMove: cancelLongPress,
          onTouchCancel: cancelLongPress,
        }
      : {};

  const rowEvents = (n: Node) => ({
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
        data-node-id={n.id}
        tabIndex={-1}
        role="row"
        className={`group absolute inset-x-0 top-0 rounded-md px-2 text-sm select-none [-webkit-touch-callout:none] ${rowCls(i, n)}`}
        style={{ height: getRowHeight(), transform: `translateY(${top}px)`, ...gridStyle, ...dropHoverStyle(n) }}
        onClick={rowClick(n, i)}
        onDoubleClick={rowDoubleClick(n, i)}
        {...rowEvents(n)}
      >
        {rowCells(row)}
      </div>
    );
  };

  if (view === "grid") {
    return withMarquee(
      <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
        {/* 网格同样提供名称过滤（此前切到网格后过滤输入整个消失，只能切回列表过滤） */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <NameFilterInput value={nameFilter} onChange={setNameFilter} className="w-full sm:w-56" />
          <span className="num text-2xs text-ink-3">{display.length} 项</span>
        </div>
        <FileGrid
          nodes={display}
          containerRef={containerRef}
          onContainerKeyDown={onContainerKeyDown}
          cellClass={gridCellClass}
          cellStyle={(_i, n) => ({
            ...dropHoverStyle(n),
            ...(selected.has(n.id) && selectable
              ? { backgroundColor: "color-mix(in srgb, var(--color-ink) 5%, transparent)" }
              : {}),
          })}
          onClick={rowClick}
          onDoubleClick={rowDoubleClick}
          cellHandlers={rowEvents}
          overlay={(n) => (selectable ? checkbox(n, "absolute top-2 left-2 z-content") : null)}
          badge={sharedBadge}
          actions={gridActions ?? actionCell}
        />
      </div>,
    );
  }

  // 列表体：普通列表与虚拟列表共用同一份行内容；行序即 display 顺序
  const listBody = (
    <div className="relative">
      {rows.map((row, i) => {
        const n = row.original;
        return (
          <div
            key={row.id}
            data-file-row={i}
            data-node-id={n.id}
            tabIndex={-1}
            role="row"
            className={`group border-b border-line/60 text-sm select-none [-webkit-touch-callout:none] transition-colors ${rowCls(i, n)} ${animate ? "anim-item-in" : ""}`}
            style={{ ...gridStyle, height: getRowHeight(), padding: "0 8px", ...dropHoverStyle(n) }}
            onClick={rowClick(n, i)}
            onDoubleClick={rowDoubleClick(n, i)}
            {...rowEvents(n)}
          >
            {rowCells(row)}
          </div>
        );
      })}
    </div>
  );

  if (virtual) {
    return withMarquee(
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
      </div>,
    );
  }

  // 非虚拟分支也必须有滚动容器：≤49 行时列表高度可能超过视口（父级是 overflow-hidden）
  return withMarquee(
    <div
      ref={containerRef}
      data-testid="file-list-container"
      tabIndex={0}
      onKeyDown={onContainerKeyDown}
      className="md:flex md:min-h-0 md:flex-1 md:flex-col"
    >
      {listHeader}
      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">{listBody}</div>
    </div>,
  );
}
