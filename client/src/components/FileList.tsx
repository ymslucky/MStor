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
}

export default function FileList({ nodes, onOpenDir, onOpenFile, actions, emptyText = "该目录为空" }: Props) {
  if (!nodes.length) return <EmptyState icon="📁" title={emptyText} />;
  return (
    // 双形态同一 DOM：移动端卡片行（flex），sm+ 恢复表格行
    <table className="w-full text-sm">
      <thead className="hidden text-left text-xs text-ink-faint sm:table-header-group">
        <tr className="border-b border-line">
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
            <td className="min-w-0 max-w-[12rem] py-2 sm:max-w-xs">
              <button
                className="line-clamp-2 break-all text-left text-ink hover:underline sm:truncate"
                onClick={() => (n.is_dir ? onOpenDir(n.id) : onOpenFile(n))}
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
