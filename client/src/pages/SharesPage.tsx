import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ban, Link2 } from "lucide-react";
import { batchRevokeShares, listShares, revokeShare } from "../api/shares";
import type { Share } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { NodeIcon } from "../components/NodeIcon";
import { SelectionBar } from "../components/SelectionBar";
import { toast } from "../components/Toaster";
import { Button, ConfirmDialog, EmptyState, GlassCard, IconButton, Pill } from "../components/ui";
import { useFileSelection } from "../hooks/useFileSelection";
import { formatBytes, formatDate } from "../lib/format";
import { queryKeys } from "../lib/queryKeys";

export default function SharesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.shares, queryFn: listShares });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.shares });
  const revoke = useMutation({ mutationFn: (id: string) => revokeShare(id), onSuccess: invalidate });
  const [revoking, setRevoking] = useState<Share | null>(null);
  // 批量撤销状态
  const [batchRevoking, setBatchRevoking] = useState(false);
  const [busy, setBusy] = useState(false);
  const shares = query.data?.shares ?? [];
  const ids = shares.map((s) => s.id);
  const selection = useFileSelection(ids, "shares");

  const runBatchRevoke = async () => {
    setBusy(true);
    try {
      const r = await batchRevokeShares([...selection.selected]);
      if (r.failed.length) toast(`已撤销 ${r.revoked} 个分享，${r.failed.length} 个失败`, "error");
      else toast(`已撤销 ${r.revoked} 个分享`, "info");
      selection.clear();
    } catch {
      toast("批量撤销失败", "error");
    } finally {
      setBusy(false);
      setBatchRevoking(false);
    }
    invalidate();
  };

  const allSelected = shares.length > 0 && selection.count === shares.length;

  return (
    <div className="md:pb-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-ink">我的分享</h1>
        {shares.length > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-2">
            <input
              type="checkbox"
              aria-label="全选分享"
              className="h-4 w-4 accent-primary"
              checked={allSelected}
              onChange={() => (allSelected ? selection.clear() : selection.selectAll())}
            />
            全选
          </label>
        )}
      </div>
      <AsyncState query={query} skeletonRows={4}>
        {shares.length === 0 ? (
          <EmptyState icon={Link2} title="暂无分享" />
        ) : (
        <GlassCard className="p-3 sm:p-4">
          <table className="w-full text-sm">
            <tbody>
              {shares.map((s) => (
                <tr key={s.id} className="border-b border-line transition-colors last:border-b-0 hover:bg-bg-sub">
                  <td className="w-8 py-2">
                    <input
                      type="checkbox"
                      aria-label={`选择 ${s.node_name}`}
                      className="h-4 w-4 accent-primary"
                      checked={selection.isSelected(s.id)}
                      onChange={() => selection.toggle(s.id)}
                    />
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-1.5 font-medium text-ink">
                      <NodeIcon node={{ is_dir: s.node_is_dir, mime: null }} size={16} className="shrink-0" />
                      <span className="truncate">{s.node_name}</span>
                      {/* 失效标记：纯展示（打开链接仍 410） */}
                      {s.expires_at != null && s.expires_at < Date.now() && (
                        <Pill tone="neutral">已过期</Pill>
                      )}
                      {s.max_downloads != null && s.downloads >= s.max_downloads && (
                        <Pill tone="danger">已用尽</Pill>
                      )}
                    </div>
                    <div className="text-xs text-ink-3">/s/{s.token}</div>
                  </td>
                  <td className="hidden py-2 text-xs text-ink-2 sm:table-cell">
                    {s.node_is_dir ? "文件夹" : formatBytes(s.node_size)}
                    {" · "}已下载 {s.downloads} 次
                    {s.max_downloads != null ? ` / 上限 ${s.max_downloads}` : " · 不限次数"}
                    {s.last_download_at ? ` · 最近 ${formatDate(s.last_download_at)}` : " · 尚未下载"}
                    {s.expires_at ? ` · 至 ${formatDate(s.expires_at)}` : " · 永久"}
                  </td>
                  <td className="py-2 text-right">
                    <a href={`/s/${s.token}`} className="mr-3 text-primary-text hover:underline" target="_blank" rel="noreferrer">
                      打开
                    </a>
                    <IconButton label="撤销" onClick={() => setRevoking(s)}>
                      <Ban size={16} aria-hidden />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
        )}
      </AsyncState>
      {/* 批量操作条：与文件页/回收站共用 SelectionBar */}
      <SelectionBar count={selection.count} hidden={batchRevoking} onClear={selection.clear}>
        <Button size="sm" variant="danger" disabled={busy} onClick={() => setBatchRevoking(true)}>
          撤销
        </Button>
      </SelectionBar>
      {revoking && (
        <ConfirmDialog
          open
          title="撤销分享"
          description={`撤销「${revoking.node_name}」的分享？撤销后链接立即失效。`}
          confirmText="撤销"
          danger
          onConfirm={() => {
            revoke.mutate(revoking.id);
            setRevoking(null);
          }}
          onCancel={() => setRevoking(null)}
        />
      )}
      {batchRevoking && (
        <ConfirmDialog
          open
          title={`撤销选中的 ${selection.count} 个分享`}
          description="撤销后分享链接立即失效，此操作不可恢复。"
          confirmText="撤销"
          danger
          busy={busy}
          onConfirm={() => void runBatchRevoke()}
          onCancel={() => setBatchRevoking(false)}
        />
      )}
    </div>
  );
}
