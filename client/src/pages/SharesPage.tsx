import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listShares, revokeShare } from "../api/shares";
import type { Share } from "../api/types";
import { ConfirmDialog, EmptyState, GlassCard, IconButton } from "../components/ui";
import { formatBytes, formatDate } from "../lib/format";

export default function SharesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["shares"], queryFn: listShares });
  const revoke = useMutation({ mutationFn: (id: string) => revokeShare(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shares"] }) });
  const [revoking, setRevoking] = useState<Share | null>(null);
  const shares = query.data?.shares ?? [];

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold text-ink">我的分享</h1>
      {!shares.length && <EmptyState icon="🔗" title="暂无分享" />}
      {shares.length > 0 && (
        <GlassCard className="p-3 sm:p-4">
          <table className="w-full text-sm">
            <tbody>
              {shares.map((s) => (
                <tr key={s.id} className="border-b border-line transition-colors last:border-b-0 hover:bg-gray-50">
                  <td className="py-2">
                    <div className="font-medium text-ink">{s.node_is_dir ? "📁" : "📄"} {s.node_name}</div>
                    <div className="text-xs text-ink-faint">/s/{s.token}</div>
                  </td>
                  <td className="hidden py-2 text-xs text-ink-dim sm:table-cell">
                    {s.node_is_dir ? "文件夹" : formatBytes(s.node_size)}
                    {" · "}已下载 {s.downloads} 次
                    {s.expires_at ? ` · 有效期至 ${formatDate(s.expires_at)}` : " · 永久"}
                  </td>
                  <td className="py-2 text-right">
                    <a href={`/s/${s.token}`} className="mr-3 text-accent hover:underline" target="_blank" rel="noreferrer">
                      打开
                    </a>
                    <IconButton label="撤销" onClick={() => setRevoking(s)}>
                      <span aria-hidden>🚫</span>
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}
      {revoking && (
        <ConfirmDialog
          open
          title="撤销分享"
          description={`撤销「${revoking.node_name}」的分享？`}
          confirmText="撤销"
          danger
          onConfirm={() => {
            revoke.mutate(revoking.id);
            setRevoking(null);
          }}
          onCancel={() => setRevoking(null)}
        />
      )}
    </div>
  );
}
