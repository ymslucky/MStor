import type { ReactNode } from "react";
import { contentUrl } from "../api/nodes";
import type { Node } from "../api/types";
import { formatBytes, formatDate } from "../lib/format";
import { EmptyState } from "./ui";

interface Props {
  nodes: Node[];
  onOpenDir: (id: string) => void;
  onOpenFile: (node: Node) => void;
  actions?: (node: Node) => ReactNode;
  emptyText?: string;
  /** 批量选择：显示行首 checkbox（点击不触发行打开） */
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  /** 视图形态：list 表格（默认）/ grid 网格卡片 */
  view?: "list" | "grid";
}

export default function FileList({
  nodes,
  onOpenDir,
  onOpenFile,
  actions,
  emptyText = "该目录为空",
  selectable = false,
  selected = new Set<string>(),
  onToggle,
  view = "list",
}: Props) {
  if (!nodes.length) return <EmptyState icon="📁" title={emptyText} />;

  const open = (n: Node) => (n.is_dir ? onOpenDir(n.id) : onOpenFile(n));

  // 行首 checkbox：行内独立控件，点击不冒泡触发行打开
  const checkbox = (n: Node, cls = "") =>
    selectable && onToggle ? (
      <input
        type="checkbox"
        aria-label={`选择 ${n.name}`}
        checked={selected.has(n.id)}
        onChange={() => onToggle(n.id)}
        className={`h-4 w-4 shrink-0 cursor-pointer accent-emerald-600 ${cls}`}
      />
    ) : null;

  // 表头全选：当前页全选/清除（再次点击取反）
  const toggleAll = () => {
    if (!onToggle) return;
    const all = nodes.every((n) => selected.has(n.id));
    for (const n of nodes) {
      if (all ? selected.has(n.id) : !selected.has(n.id)) onToggle(n.id);
    }
  };

  if (view === "grid") {
    return (
      // 网格视图（同一数据）：缩略区 h-28 + 名称/大小，checkbox 左上角浮层
      <div data-testid="file-grid" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {nodes.map((n) => {
          const isImage = !n.is_dir && !!n.mime?.startsWith("image/");
          return (
            <div key={n.id} className="relative overflow-hidden rounded-card border border-line bg-white shadow-card">
              {selectable && checkbox(n, "absolute top-2 left-2 z-10")}
              <button type="button" className="block w-full text-left" onClick={() => open(n)}>
                <div className="flex h-28 items-center justify-center overflow-hidden bg-gray-50/70">
                  {isImage ? (
                    <img src={contentUrl(n.id)} alt={n.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 text-3xl">
                      {n.is_dir ? "📁" : "📄"}
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <div className="truncate text-sm text-ink">
                    {n.is_dir ? "📁" : "📄"} {n.name}
                  </div>
                  <div className="text-xs text-ink-faint">{formatBytes(n.size)}</div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    // 双形态同一 DOM：移动端卡片行（flex），sm+ 恢复表格行
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
        {nodes.map((n) => (
          <tr
            key={n.id}
            className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-line bg-gray-50/50 p-3 sm:table-row sm:rounded-none sm:border-x-0 sm:border-t-0 sm:border-b sm:border-line sm:bg-transparent sm:p-0 sm:hover:bg-gray-50"
          >
            {selectable && <td className="py-2 pr-1 sm:w-8 sm:pr-2">{checkbox(n)}</td>}
            <td className="min-w-0 max-w-[12rem] py-2 sm:max-w-xs">
              <button
                className="line-clamp-2 break-all text-left text-ink hover:underline sm:truncate"
                onClick={() => open(n)}
              >
                {n.is_dir ? "📁" : "📄"} {n.name}
              </button>
            </td>
            <td className="hidden py-2 text-ink-dim sm:table-cell">{formatBytes(n.size)}</td>
            <td className="hidden py-2 text-ink-dim md:table-cell">{formatDate(n.updated_at)}</td>
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
  );
}
