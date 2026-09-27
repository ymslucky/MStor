import { Fragment, useEffect, useRef, useState } from "react";
import type * as React from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderOpen } from "lucide-react";
import { contentUrl } from "../api/nodes";
import type { Node } from "../api/types";
import { hasNodeDrag, readNodeDrag, setNodeDrag } from "../lib/dnd";
import { formatBytes, formatDate } from "../lib/format";
import { NodeIcon } from "./NodeIcon";
import { Badge, EmptyState } from "./ui";

/** 列表 ≥50 行启用虚拟滚动 */
const VIRTUAL_THRESHOLD = 50;
/** 虚拟行高（设计规范：列表行高 48px） */
const ROW_HEIGHT = 48;

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
  /** 批量选择：显示行首 checkbox（点击不触发行打开） */
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

// 虚拟滚动列表壳：外层容器（键盘导航）+ 固定行高窗口化
function VirtualizedList({
  nodes,
  focusIndex = -1,
  containerRef,
  onContainerKeyDown,
  row,
}: {
  nodes: Node[];
  focusIndex?: number;
  containerRef?: RefObject<HTMLDivElement | null>;
  onContainerKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
  row: (n: Node, index: number, top: number) => ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // 键盘焦点行滚动进可视区（jsdom 无 Element.scrollTo，跳过）
  useEffect(() => {
    if (focusIndex < 0) return;
    const el = scrollRef.current;
    if (!el || typeof el.scrollTo !== "function") return;
    virtualizer.scrollToIndex(focusIndex);
  }, [focusIndex, virtualizer]);

  return (
    <div ref={containerRef} data-testid="file-list-container" tabIndex={0} onKeyDown={onContainerKeyDown}>
      <div aria-hidden className="hidden items-center gap-2 px-2 pb-1 text-xs text-ink-faint sm:flex">
        <span className="w-6" />
        <span className="w-5" />
        <span className="min-w-0 flex-1">名称</span>
        <span className="w-20 text-right">大小</span>
        <span className="w-24">修改时间</span>
        <span className="w-16" />
      </div>
      <div ref={scrollRef} data-testid="file-virtual" className="max-h-[30rem] overflow-y-auto">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const n = nodes[vi.index];
            return <Fragment key={n.id}>{row(n, vi.index, vi.start)}</Fragment>;
          })}
        </div>
      </div>
    </div>
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
  selected = new Set<string>(),
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

  if (!nodes.length) return <EmptyState icon={FolderOpen} title={emptyText} action={emptyActions} />;

  const open = (n: Node) => (n.is_dir ? onOpenDir(n.id) : onOpenFile(n));
  const virtual = view === "list" && nodes.length >= VIRTUAL_THRESHOLD;
  // 入场动画仅小列表（≤10 项，stagger 20ms）
  const animate = nodes.length <= 10 && !virtual;

  const openAndFocus = (n: Node, i: number) => {
    onRowFocus?.(i);
    open(n);
  };

  // 行点击：Shift=范围选 / Ctrl/Cmd=点选，普通点击打开
  const rowClick = (n: Node, i: number) => (e: ReactMouseEvent) => {
    if (draggingId) return;
    onRowFocus?.(i);
    if (selectable && onToggle) {
      if (e.shiftKey && onSelectRange) {
        e.preventDefault();
        onSelectRange(n.id);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        onToggle(n.id);
        return;
      }
    }
    open(n);
  };

  // 行首 checkbox：行内独立控件，点击不冒泡触发行打开
  const checkbox = (n: Node, cls = "") =>
    selectable && onToggle ? (
      <input
        type="checkbox"
        aria-label={`选择 ${n.name}`}
        checked={selected.has(n.id)}
        disabled={!!draggingId}
        onChange={() => onToggle(n.id)}
        className={`h-4 w-4 shrink-0 cursor-pointer accent-emerald-600 ${cls}`}
      />
    ) : null;

  // 表头全选：当前列表全选/清除（再次点击取反）
  const toggleAll = () => {
    if (!onToggle || draggingId) return;
    const all = nodes.every((n) => selected.has(n.id));
    for (const n of nodes) {
      if (all ? selected.has(n.id) : !selected.has(n.id)) onToggle(n.id);
    }
  };

  // 键盘焦点行 / 拖拽悬停行高亮（2px 主色）
  const rowCls = (i: number, n: Node) =>
    [focusIndex === i ? "ring-2 ring-primary" : "", dragOverId === n.id ? "ring-2 ring-primary" : ""]
      .filter(Boolean)
      .join(" ");

  // drop 悬停底色（inline 样式避免与表格行响应式背景类冲突）
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
  const animStyle = (i: number): CSSProperties => (animate ? { animationDelay: `${i * 20}ms` } : {});

  // 虚拟行内容（绝对定位 + translateY）
  const virtualRow = (n: Node, i: number, top: number) => (
    <div
      data-file-row={i}
      tabIndex={-1}
      className={`absolute inset-x-0 top-0 flex items-center gap-2 rounded-lg px-2 text-sm ${rowCls(i, n)}`}
      style={{ height: ROW_HEIGHT, transform: `translateY(${top}px)`, ...dropHoverStyle(n) }}
      onContextMenu={(e) => onNodeContextMenu?.(e, n)}
      {...dragProps(n)}
      {...folderDropProps(n)}
    >
      {checkbox(n)}
      <NodeIcon node={n} size={18} className="shrink-0" />
      <button type="button" className="min-w-0 flex-1 truncate text-left text-ink hover:underline" onClick={rowClick(n, i)}>
        {n.name}
      </button>
      {sharedBadge(n)}
      <span className="hidden w-20 shrink-0 text-right tabular-nums text-ink-dim sm:block">{formatBytes(n.size)}</span>
      <span className="hidden w-24 shrink-0 tabular-nums text-ink-dim md:block">{formatDate(n.updated_at)}</span>
      <span className="flex shrink-0 items-center gap-1">
        {!n.is_dir && (
          <a href={contentUrl(n.id, true)} className="text-accent hover:underline" aria-label={`下载 ${n.name}`}>
            下载
          </a>
        )}
        {actions?.(n)}
      </span>
    </div>
  );

  if (virtual) {
    return (
      <VirtualizedList
        nodes={nodes}
        focusIndex={focusIndex}
        containerRef={containerRef}
        onContainerKeyDown={onContainerKeyDown}
        row={virtualRow}
      />
    );
  }

  if (view === "grid") {
    return (
      // 网格视图（同一数据）：缩略区 h-28 + 名称/大小，checkbox 左上角浮层
      <div
        ref={containerRef}
        data-testid="file-grid"
        tabIndex={0}
        onKeyDown={onContainerKeyDown}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
      >
        {nodes.map((n, i) => {
          const isImage = !n.is_dir && !!n.mime?.startsWith("image/");
          return (
            <div
              key={n.id}
              data-file-row={i}
              tabIndex={-1}
              className={`relative overflow-hidden rounded-card border border-line bg-white shadow-card ${rowCls(i, n)} ${animate ? "anim-item-in" : ""}`}
              style={{ ...animStyle(i), ...dropHoverStyle(n) }}
              onContextMenu={(e) => onNodeContextMenu?.(e, n)}
              {...dragProps(n)}
              {...folderDropProps(n)}
            >
              {selectable && checkbox(n, "absolute top-2 left-2 z-10")}
              <button type="button" className="block w-full text-left" onClick={rowClick(n, i)}>
                <div className="flex h-28 items-center justify-center overflow-hidden bg-gray-50/70">
                  {isImage ? (
                    <img src={contentUrl(n.id)} alt={n.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <NodeIcon node={n} size={44} className="text-ink-3" />
                  )}
                </div>
                <div className="p-2">
                  <div className="flex items-center gap-1.5">
                    <NodeIcon node={n} size={14} className="shrink-0" />
                    <span className="truncate text-sm text-ink">{n.name}</span>
                    {sharedBadge(n)}
                  </div>
                  <div className="text-xs tabular-nums text-ink-faint">{formatBytes(n.size)}</div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={containerRef} data-testid="file-list-container" tabIndex={0} onKeyDown={onContainerKeyDown}>
      {/* 双形态同一 DOM：移动端卡片行（flex），sm+ 恢复表格行 */}
      <table className="w-full text-sm">
        <thead className="hidden text-left text-xs text-ink-faint sm:table-header-group">
          <tr className="border-b border-line">
            {selectable && (
              <th className="w-8 py-2 pr-2">
                <input
                  type="checkbox"
                  aria-label="全选"
                  checked={nodes.every((n) => selected.has(n.id))}
                  onChange={toggleAll}
                  disabled={!!draggingId}
                  className="h-4 w-4 cursor-pointer accent-emerald-600"
                />
              </th>
            )}
            <th className="py-2 font-medium">名称</th>
            <th className="hidden py-2 font-medium sm:table-cell">大小</th>
            <th className="hidden py-2 font-medium md:table-cell">修改时间</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {nodes.map((n, i) => (
            <tr
              key={n.id}
              data-file-row={i}
              tabIndex={-1}
              className={`mb-2 flex items-center justify-between gap-2 rounded-xl border border-line bg-gray-50/50 p-3 sm:table-row sm:rounded-none sm:border-x-0 sm:border-t-0 sm:border-b sm:border-line sm:bg-transparent sm:p-0 sm:hover:bg-gray-50 ${rowCls(i, n)} ${animate ? "anim-item-in" : ""}`}
              style={{ ...animStyle(i), ...dropHoverStyle(n) }}
              onContextMenu={(e) => onNodeContextMenu?.(e, n)}
              {...dragProps(n)}
              {...folderDropProps(n)}
            >
              {selectable && <td className="py-2 pr-1 sm:w-8 sm:pr-2">{checkbox(n)}</td>}
              <td className="min-w-0 max-w-[12rem] py-2 sm:max-w-xs">
                <span className="flex items-center gap-2">
                  <NodeIcon node={n} size={18} className="shrink-0" />
                  <button
                    className="line-clamp-2 break-all text-left text-ink hover:underline sm:truncate"
                    onClick={rowClick(n, i)}
                  >
                    {n.name}
                  </button>
                  {sharedBadge(n)}
                </span>
              </td>
              <td className="hidden py-2 tabular-nums text-ink-dim sm:table-cell">{formatBytes(n.size)}</td>
              <td className="hidden py-2 tabular-nums text-ink-dim md:table-cell">{formatDate(n.updated_at)}</td>
              <td className="py-2 text-right">
                <span className="flex shrink-0 items-center justify-end gap-1">
                  {!n.is_dir && (
                    <a href={contentUrl(n.id, true)} className="text-accent hover:underline" aria-label={`下载 ${n.name}`}>
                      下载
                    </a>
                  )}
                  {actions?.(n)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
