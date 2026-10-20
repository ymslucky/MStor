import { useQuery } from "@tanstack/react-query";
import { Activity, HardDrive, Users } from "lucide-react";
import { getAdminOverview } from "../api/me";
import { formatBytes, formatDate } from "../lib/format";
import { GlassCard, Skeleton } from "./ui";

const ACTION_LABEL: Record<string, string> = {
  "invitation.create": "发出邀请",
  "invitation.accept": "接受邀请",
  "invitation.revoke": "撤销邀请",
  "admin.act_as": "管理员代登录",
};

/** 管理台概览：只读聚合，打开设置页才拉一次，不轮询 */
export function AdminOverviewSection() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-overview"], queryFn: getAdminOverview });
  if (isLoading || !data) {
    return (
      <GlassCard className="p-4">
        <Skeleton className="h-24 w-full" />
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <h2 className="mb-3 flex items-center gap-1.5 font-semibold text-ink">
          <Activity size={16} aria-hidden />
          平台概览
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-3">用户</dt>
            <dd className="font-display text-xl font-semibold text-ink">{data.users.total}</dd>
            <dd className="text-[11px] text-ink-3">
              停用 {data.users.disabled} · 待绑定 {data.users.unbound}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">空间</dt>
            <dd className="font-display text-xl font-semibold text-ink">{data.workspaces.total}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-ink-3">
              <HardDrive size={12} aria-hidden />
              逻辑占用合计
            </dt>
            <dd className="font-display text-xl font-semibold text-ink">{formatBytes(data.workspaces.usedBytes)}</dd>
            <dd className="text-[11px] text-ink-3">按逻辑字节计；R2 去重不影响配额</dd>
          </div>
        </dl>
      </GlassCard>

      <GlassCard className="p-4">
        <h2 className="mb-3 flex items-center gap-1.5 font-semibold text-ink">
          <Users size={16} aria-hidden />
          空间用量（前 20）
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-3">
                <th className="py-2 pr-3 font-medium">空间</th>
                <th className="py-2 pr-3 font-medium">已用 / 配额</th>
                <th className="py-2 pr-3 font-medium">成员</th>
                <th className="py-2 font-medium">节点</th>
              </tr>
            </thead>
            <tbody>
              {data.topWorkspaces.map((w) => {
                const pct = w.quotaBytes > 0 ? Math.round((w.usedBytes / w.quotaBytes) * 100) : 0;
                const tone = pct >= 95 ? "text-danger" : pct >= 80 ? "text-amber-700" : "text-ink-2";
                return (
                  <tr key={w.id} className="border-b border-line/60">
                    <td className="max-w-40 truncate py-2 pr-3 text-ink">{w.name}</td>
                    <td className={"py-2 pr-3 " + tone}>
                      {formatBytes(w.usedBytes)} / {formatBytes(w.quotaBytes)}（{pct}%）
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{w.members}</td>
                    <td className="py-2 text-ink-2">{w.nodes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h2 className="mb-3 font-semibold text-ink">最近审计（20 条）</h2>
        {data.recentAudit.length === 0 ? (
          <p className="text-sm text-ink-3">暂无审计事件</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.recentAudit.map((ev, i) => (
              <li key={ev.action + "-" + ev.createdAt + "-" + i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink">{ACTION_LABEL[ev.action] ?? ev.action}</span>
                <span className="shrink-0 text-xs text-ink-3">
                  {ev.targetId ? ev.targetId.slice(0, 12) : "—"} · {formatDate(ev.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
