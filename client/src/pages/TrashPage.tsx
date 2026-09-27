import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTrash, purgeNode, restoreNode } from "../api/trash";
import type { Node } from "../api/types";
import FileList from "../components/FileList";
import { GlassCard, IconButton } from "../components/ui";
import { formatBytes, formatDate } from "../lib/format";

export default function TrashPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["trash"], queryFn: listTrash });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
    void queryClient.invalidateQueries({ queryKey: ["files"] });
    // 彻底删除会释放配额，恢复会占用配额，都需要刷新配额条
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  };
  const restore = useMutation({ mutationFn: (id: string) => restoreNode(id), onSuccess: invalidate });
  const purge = useMutation({ mutationFn: (id: string) => purgeNode(id), onSuccess: invalidate });

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold text-ink">回收站</h1>
      <p className="mb-3 text-xs text-ink-faint">回收站内容保留 30 天后自动清理；彻底删除不可恢复。</p>
      {query.isPending && <div className="py-16 text-center text-sm text-ink-dim">加载中…</div>}
      {query.data && (
        <GlassCard className="p-3 sm:p-4">
          <FileList
            nodes={query.data.nodes}
            onOpenDir={() => {}}
            onOpenFile={() => {}}
            emptyText="回收站为空"
            actions={(n: Node) => (
              <>
                <span className="hidden text-xs text-ink-faint lg:inline">
                  {formatBytes(n.size)} · 删除于 {n.deleted_at ? formatDate(n.deleted_at) : "-"}
                </span>
                <IconButton label="恢复" onClick={() => restore.mutate(n.id)}>
                  <span aria-hidden>♻️</span>
                </IconButton>
                <IconButton
                  label="彻底删除"
                  onClick={() => window.confirm(`彻底删除「${n.name}」？此操作不可恢复。`) && purge.mutate(n.id)}
                >
                  <span aria-hidden>🗑️</span>
                </IconButton>
              </>
            )}
          />
        </GlassCard>
      )}
    </div>
  );
}
