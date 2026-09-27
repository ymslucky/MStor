import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { listTrash, purgeNode, restoreNode } from "../api/trash";
import type { Node } from "../api/types";
import FileList from "../components/FileList";
import { ConfirmDialog, GlassCard, IconButton } from "../components/ui";
import { formatBytes, formatDate } from "../lib/format";

export default function TrashPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["trash"], queryFn: listTrash });
  const [purging, setPurging] = useState<Node | null>(null);
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
                  <RotateCcw size={16} aria-hidden />
                </IconButton>
                <IconButton label="彻底删除" onClick={() => setPurging(n)}>
                  <Trash2 size={16} aria-hidden />
                </IconButton>
              </>
            )}
          />
        </GlassCard>
      )}
      {purging && (
        <ConfirmDialog
          open
          title={`彻底删除「${purging.name}」`}
          description={`彻底删除「${purging.name}」？此操作不可恢复。`}
          confirmText="彻底删除"
          danger
          onConfirm={() => {
            purge.mutate(purging.id);
            setPurging(null);
          }}
          onCancel={() => setPurging(null)}
        />
      )}
    </div>
  );
}
