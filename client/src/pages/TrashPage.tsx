import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { batchPurge, batchRestore, listTrash, purgeNode, restoreNode } from "../api/trash";
import { getMe } from "../api/me";
import type { Node } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { PageHeader } from "../components/layout/PageHeader";
import FileList from "../components/FileList";
import { RowAction } from "../components/RowAction";
import { SelectionBar } from "../components/SelectionBar";
import { toast } from "../components/Toaster";
import { Button, ConfirmDialog, GlassCard } from "../components/ui";
import { useFileSelection } from "../hooks/useFileSelection";
import { formatBytes, formatDate } from "../lib/format";
import { queryKeys } from "../lib/queryKeys";

export default function TrashPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.trash, queryFn: listTrash, meta: { silent: true } });
  // 保留天数随动态配置：设置页变更后 invalidate ["me"] 即同步
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const retentionDays = meQuery.data?.trashRetentionDays ?? 30;
  const nodes = query.data?.nodes ?? [];
  const ids = nodes.map((n) => n.id);
  const selection = useFileSelection(ids, "trash");
  const [purging, setPurging] = useState<Node | null>(null);
  // 批量状态：彻底删除确认 / 清空回收站确认 / 忙碌
  const [batchPurging, setBatchPurging] = useState(false);
  const [purgingAll, setPurgingAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.trash });
    void queryClient.invalidateQueries({ queryKey: queryKeys.filesAll });
    // 彻底删除会释放配额，恢复会占用配额，都需要刷新配额条
    void queryClient.invalidateQueries({ queryKey: queryKeys.me });
  };
  const restore = useMutation({ mutationFn: (id: string) => restoreNode(id), onSuccess: invalidate });
  const purge = useMutation({ mutationFn: (id: string) => purgeNode(id), onSuccess: invalidate });

  // 行内动作：列表与网格共用（网格不渲染删除时间等长文本）
  const rowActions = (n: Node) => (
    <>
      <RowAction label="恢复" tone="blue" onClick={() => restore.mutate(n.id)}>
        <RotateCcw size={14} aria-hidden />
      </RowAction>
      <RowAction label="彻底删除" tone="danger" onClick={() => setPurging(n)}>
        <Trash2 size={14} aria-hidden />
      </RowAction>
    </>
  );

  // 批量还原：还原是安全操作，不需要确认
  const runBatchRestore = async () => {
    setBusy(true);
    try {
      const r = await batchRestore([...selection.selected]);
      if (r.failed.length) toast(`已还原 ${r.restored ?? 0} 项，${r.failed.length} 项失败`, "error");
      else toast(`已还原 ${r.restored ?? 0} 项`, "info");
      selection.clear();
    } catch {
      toast("批量还原失败", "error");
    } finally {
      setBusy(false);
    }
    invalidate();
  };

  // 批量彻底删除：确认后执行；失败清单提示
  const runBatchPurge = async (all: boolean) => {
    const targetIds = all ? ids : [...selection.selected];
    setBusy(true);
    try {
      const r = await batchPurge(targetIds);
      if (r.failed.length) toast(`已彻底删除 ${r.purged ?? 0} 项，${r.failed.length} 项失败`, "error");
      else toast(`已彻底删除 ${r.purged ?? 0} 项`, "info");
      selection.clear();
    } catch {
      toast("批量删除失败", "error");
    } finally {
      setBusy(false);
      setBatchPurging(false);
      setPurgingAll(false);
    }
    invalidate();
  };

  return (
    <div className="md:pb-4">
      <PageHeader
        title="回收站"
        description={`内容保留 ${retentionDays} 天后自动清理；彻底删除不可恢复。`}
        actions={
          nodes.length > 0 ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPurgingAll(true)}>
              清空回收站
            </Button>
          ) : undefined
        }
      />
      <GlassCard className="p-3 sm:p-4">
        <AsyncState query={query} skeletonRows={4}>
          <FileList
            nodes={nodes}
            selectable
            selected={selection.selected}
            onToggle={selection.toggle}
            onSelectRange={selection.selectRange}
            onSetSelection={selection.setSelection}
            onOpenDir={() => {}}
            onOpenFile={() => {}}
            tapOpens={false}
            emptyText="回收站为空"
            actions={(n: Node) => (
              <>
                <span className="hidden text-xs text-ink-faint lg:inline">
                  {formatBytes(n.size)} · 删除于 {n.deleted_at ? formatDate(n.deleted_at) : "-"}
                </span>
                {rowActions(n)}
              </>
            )}
            gridActions={rowActions}
          />
        </AsyncState>
      </GlassCard>
      <SelectionBar count={selection.count} hidden={batchPurging || purgingAll} onClear={selection.clear}>
        <Button size="sm" disabled={busy} onClick={() => void runBatchRestore()}>
          还原
        </Button>
        <Button size="sm" variant="danger" disabled={busy} aria-label="批量彻底删除" onClick={() => setBatchPurging(true)}>
          彻底删除
        </Button>
      </SelectionBar>
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
      {batchPurging && (
        <ConfirmDialog
          open
          title={`彻底删除选中的 ${selection.count} 项`}
          description={`彻底删除选中的 ${selection.count} 项？此操作不可恢复。`}
          confirmText="彻底删除"
          danger
          busy={busy}
          onConfirm={() => void runBatchPurge(false)}
          onCancel={() => setBatchPurging(false)}
        />
      )}
      {purgingAll && (
        <ConfirmDialog
          open
          title={`清空回收站（${nodes.length} 项）`}
          description="彻底删除回收站中的全部内容？此操作不可恢复。"
          confirmText="清空"
          danger
          busy={busy}
          onConfirm={() => void runBatchPurge(true)}
          onCancel={() => setPurgingAll(false)}
        />
      )}
    </div>
  );
}
