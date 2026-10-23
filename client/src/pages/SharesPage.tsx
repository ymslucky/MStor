import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ban, Link2 } from "lucide-react";
import { batchRevokeShares, listShares, revokeShare } from "../api/shares";
import type { Share } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { PageHeader } from "../components/layout/PageHeader";
import { NodeIcon } from "../components/NodeIcon";
import { SelectionBar } from "../components/SelectionBar";
import { toast } from "../components/Toaster";
import { Button, ConfirmDialog, EmptyState, GlassCard, IconButton, Pill } from "../components/ui";
import { useFileSelection } from "../hooks/useFileSelection";
import { formatBytes, formatDate } from "../lib/format";
import { queryKeys } from "../lib/queryKeys";

export default function SharesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.shares, queryFn: listShares, meta: { silent: true } });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.shares });
  const revoke = useMutation({ mutationFn: (id: string) => revokeShare(id), onSuccess: invalidate });
  const [revoking, setRevoking] = useState<Share | null>(null);
  // 批量撤销状态
  const [batchRevoking, setBatchRevoking] = useState(false);
  const [busy, setBusy] = useState(false);
  type ShareFilter = "all" | "active" | "expired" | "exhausted";
  const [filter, setFilter] = useState<ShareFilter>("all");
  const shares = query.data?.shares ?? [];
  const now = Date.now();
  const isExpired = (s: Share) => s.expires_at != null && s.expires_at < now;
  const isExhausted = (s: Share) => s.max_downloads != null && s.downloads >= s.max_downloads;
  const visible = shares.filter((s) => {
    if (filter === "expired") return isExpired(s);
    if (filter === "exhausted") return isExhausted(s);
    if (filter === "active") return !isExpired(s) && !isExhausted(s);
    return true;
  });
  const ids = visible.map((s) => s.id);
  // 切换筛选时清空选择，避免批量操作误伤被隐藏的分享
  const selection = useFileSelection(ids, `shares:${filter}`);

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

  const allSelected = visible.length > 0 && selection.count === visible.length;
  const FILTERS: { key: ShareFilter; label: string; count: number }[] = [
    { key: "all", label: "全部", count: shares.length },
    { key: "active", label: "有效", count: shares.filter((s) => !isExpired(s) && !isExhausted(s)).length },
    { key: "expired", label: "过期", count: shares.filter(isExpired).length },
    { key: "exhausted", label: "用尽", count: shares.filter(isExhausted).length },
  ];

  return (
    <div className="md:pb-4">
      <PageHeader
        title="我的分享"
        description="管理你创建的公开分享链接"
        actions={
          visible.length > 0 ? (
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-2">
              <input
                type="checkbox"
                aria-label="全选分享"
                className="h-4 w-4 accent-ink"
                checked={allSelected}
                onChange={() => (allSelected ? selection.clear() : selection.selectAll())}
              />
              全选
            </label>
          ) : undefined
        }
      />
      {shares.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="分享筛选">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                filter === f.key
                  ? "border-primary/35 bg-primary-soft font-medium text-primary-text"
                  : "border-line bg-surface-1 text-ink-2 hover:border-line-strong hover:text-ink"
              }`}
            >
              {f.label}
              <span className="num ml-1 text-ink-3">{f.count}</span>
            </button>
          ))}
        </div>
      )}
      <AsyncState query={query} skeletonRows={4}>
        {shares.length === 0 ? (
          <GlassCard className="p-2">
            <EmptyState icon={Link2} title="暂无分享" description="在文件详情点「分享」即可生成公开链接" />
          </GlassCard>
        ) : visible.length === 0 ? (
          <GlassCard className="p-2">
            <EmptyState
              icon={Link2}
              title="没有符合条件的分享"
              description="换一个筛选条件，或回到「全部」"
              action={<Button variant="ghost" onClick={() => setFilter("all")}>清除筛选</Button>}
            />
          </GlassCard>
        ) : (
        <GlassCard className="p-3 sm:p-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs tracking-wide text-ink-3 uppercase">
                <th scope="col" className="w-8 py-2" />
                <th scope="col" className="py-2 font-medium">名称</th>
                <th scope="col" className="hidden py-2 font-medium sm:table-cell">分享信息</th>
                <th scope="col" className="py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id} className="border-b border-line transition-colors last:border-b-0 hover:bg-bg-sub/70">
                  <td className="w-8 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`选择 ${s.node_name}`}
                      className="h-4 w-4 accent-ink"
                      checked={selection.isSelected(s.id)}
                      onChange={() => selection.toggle(s.id)}
                    />
                  </td>
                  <td className="py-2.5">
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
                  <td className="hidden py-2.5 text-xs text-ink-2 sm:table-cell">
                    {s.node_is_dir ? "文件夹" : formatBytes(s.node_size)}
                    {" · "}已下载 {s.downloads} 次
                    {s.max_downloads != null ? ` / 上限 ${s.max_downloads}` : " · 不限次数"}
                    {s.last_download_at ? ` · 最近 ${formatDate(s.last_download_at)}` : " · 尚未下载"}
                    {s.expires_at ? ` · 至 ${formatDate(s.expires_at)}` : " · 永久"}
                  </td>
                  <td className="py-2.5 text-right">
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
