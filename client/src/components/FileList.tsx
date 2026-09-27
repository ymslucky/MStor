import type { ReactNode } from "react";
import { contentUrl } from "../api/nodes";
import type { Node } from "../api/types";
import { formatBytes, formatDate } from "../lib/format";

interface Props {
  nodes: Node[];
  onOpenDir: (id: string) => void;
  onOpenFile: (node: Node) => void;
  actions?: (node: Node) => ReactNode;
  emptyText?: string;
}

export default function FileList({ nodes, onOpenDir, onOpenFile, actions, emptyText = "该目录为空" }: Props) {
  if (!nodes.length) return <div className="py-16 text-center text-sm text-slate-400">{emptyText}</div>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-slate-500">
        <tr className="border-b">
          <th className="py-2">名称</th>
          <th className="hidden py-2 sm:table-cell">大小</th>
          <th className="hidden py-2 md:table-cell">修改时间</th>
          <th className="py-2" />
        </tr>
      </thead>
      <tbody>
        {nodes.map((n) => (
          <tr key={n.id} className="border-b hover:bg-slate-50">
            <td className="max-w-[12rem] py-2 sm:max-w-xs">
              <button className="truncate text-left hover:underline" onClick={() => (n.is_dir ? onOpenDir(n.id) : onOpenFile(n))}>
                {n.is_dir ? "📁" : "📄"} {n.name}
              </button>
            </td>
            <td className="hidden py-2 text-slate-500 sm:table-cell">{formatBytes(n.size)}</td>
            <td className="hidden py-2 text-slate-500 md:table-cell">{formatDate(n.updated_at)}</td>
            <td className="py-2 text-right">
              <span className="flex justify-end gap-2">
                {!n.is_dir && (
                  <a href={contentUrl(n.id, true)} className="text-blue-600 hover:underline" aria-label={`下载 ${n.name}`}>
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
