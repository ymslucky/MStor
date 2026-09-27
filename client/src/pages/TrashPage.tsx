import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTrash, purgeNode, restoreNode } from "../api/trash";
import type { Node } from "../api/types";
import FileList from "../components/FileList";
import { formatBytes, formatDate } from "../lib/format";

export default function TrashPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["trash"], queryFn: listTrash });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
    void queryClient.invalidateQueries({ queryKey: ["files"] });
  };
  const restore = useMutation({ mutationFn: (id: string) => restoreNode(id), onSuccess: invalidate });
  const purge = useMutation({ mutationFn: (id: string) => purgeNode(id), onSuccess: invalidate });

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">回收站</h1>
      <p className="mb-3 text-xs text-slate-400">回收站内容保留 30 天后自动清理；彻底删除不可恢复。</p>
      {query.isPending && <div className="py-16 text-center text-sm text-slate-400">加载中…</div>}
      {query.data && (
        <FileList
          nodes={query.data.nodes}
          onOpenDir={() => {}}
          onOpenFile={() => {}}
          emptyText="回收站为空"
          actions={(n: Node) => (
            <>
              <span className="hidden text-xs text-slate-400 lg:inline">
                {formatBytes(n.size)} · 删除于 {n.deleted_at ? formatDate(n.deleted_at) : "-"}
              </span>
              <button className="text-blue-600 hover:underline" onClick={() => restore.mutate(n.id)}>恢复</button>
              <button
                className="text-red-600 hover:underline"
                onClick={() => window.confirm(`彻底删除「${n.name}」？此操作不可恢复。`) && purge.mutate(n.id)}
              >
                彻底删除
              </button>
            </>
          )}
        />
      )}
    </div>
  );
}
