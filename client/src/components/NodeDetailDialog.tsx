import type { Node } from "../api/types";
import { formatBytes, formatDate } from "../lib/format";
import { Dialog } from "./ui";

/** 只读详情弹窗：名称/大小/类型/修改时间 */
export default function NodeDetailDialog({ node, onClose }: { node: Node; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title="详情">
      <dl className="space-y-2 text-sm">
        <div className="flex items-start justify-between gap-4">
          <dt className="shrink-0 text-ink-dim">名称</dt>
          <dd className="break-all text-right font-medium text-ink">{node.name}</dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="shrink-0 text-ink-dim">大小</dt>
          <dd className="tabular-nums text-ink">{formatBytes(node.is_dir ? null : node.size)}</dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="shrink-0 text-ink-dim">类型</dt>
          <dd className="text-ink">{node.is_dir ? "文件夹" : (node.mime ?? "未知")}</dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="shrink-0 text-ink-dim">修改时间</dt>
          <dd className="tabular-nums text-ink">{formatDate(node.updated_at)}</dd>
        </div>
      </dl>
    </Dialog>
  );
}