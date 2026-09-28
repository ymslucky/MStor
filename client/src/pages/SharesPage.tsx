import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ban, Link2 } from "lucide-react";
import { batchRevokeShares, listShares, revokeShare } from "../api/shares";
import type { Share } from "../api/types";
import { NodeIcon } from "../components/NodeIcon";
import { toast } from "../components/Toaster";
import { Button, ConfirmDialog, EmptyState, GlassCard, IconButton } from "../components/ui";
import { useFileSelection } from "../hooks/useFileSelection";
import { formatBytes, formatDate } from "../lib/format";

export default function SharesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["shares"], queryFn: listShares });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["shares"] });
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
    <div>
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
      {!shares.length && <EmptyState icon={Link2} title="暂无分享" />}
      {shares.length > 0 && (
        <GlassCard className="p-3 sm:p-4">
          <table className="w-full text-sm">
            <tbody>
              {shares.map((s) => (
                <tr key={s.id} className="border-b border-line transition-colors last:border-b-0 hover:bg-gray-50">
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
                      {/* 过期灰标：纯展示（打开链接仍 410） */}
                      {s.expires_at && s.expires_at < Date.now() && (
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-ink-3">已过期</span>
                      )}
                    </div>
                    <div className="text-xs text-ink-3">/s/{s.token}</div>
                  </td>
                  <td className="hidden py-2 text-xs text-ink-2 sm:table-cell">
                    {s.node_is_dir ? "文件夹" : formatBytes(s.node_size)}
                    {" · "}已下载 {s.downloads} 次
                    {s.expires_at ? ` · 有效期至 ${formatDate(s.expires_at)}` : " · 永久"}
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
      {/* 批量操作条：移动端避让底部导航（bottom-20） */}
      {selection.count > 0 && !batchRevoking && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 sm:bottom-6">
          <div className="flex items-center gap-1.5 rounded-card border border-line bg-white p-2 shadow-card">
            <span className="whitespace-nowrap px-2 text-sm font-medium text-ink">已选 {selection.count} 项</span>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setBatchRevoking(true)}>
              撤销
            </Button>
            <Button size="sm" variant="ghost" onClick={() => selection.clear()}>
              取消
            </Button>
          </div>
        </div>
      )}
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
