import { useMemo, useState } from "react";
import { formatDate } from "../lib/format";
import { SearchInput } from "./SearchInput";
import { Pill, Surface } from "./ui";

export interface AuditEvent {
  action: string;
  targetId: string | null;
  createdAt: number;
  actorName?: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  "admin.act_as": "以管理员身份进入空间",
  "admin.user_patch": "修改用户",
  "admin.settings_patch": "修改全局设置",
  "member.invite": "邀请成员",
  "member.remove": "移除成员",
  "member.role": "修改成员角色",
  "share.revoke": "撤销分享",
  "node.purge": "彻底删除",
};

/** 动作 → 语义色：读取/查看 = 中性，写入 = 强调，删除/撤销 = 危险 */
function toneOf(action: string): "neutral" | "accent" | "danger" {
  if (/purge|delete|revoke|remove/.test(action)) return "danger";
  if (/patch|invite|role|create|act_as/.test(action)) return "accent";
  return "neutral";
}

/**
 * 审计日志表：粘性表头 + 关键字过滤 + 语义化动作标签 + 等宽时间列。
 * 只负责展示最近 N 条（服务端聚合一屏返回），不做分页——数据量级由 overview 决定。
 */
export function AuditTable({ events }: { events: AuditEvent[] }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return events;
    return events.filter((e) => (ACTION_LABEL[e.action] ?? e.action).toLowerCase().includes(kw) || (e.actorName ?? "").toLowerCase().includes(kw));
  }, [events, q]);

  return (
    <Surface className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <SearchInput label="筛选审计事件" placeholder="筛选动作或操作者…" value={q} onChange={setQ} className="w-56" />
        <span className="num shrink-0 text-2xs text-ink-3">{rows.length} 条</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-ink-3">{events.length === 0 ? "暂无审计事件" : "没有匹配的事件"}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-bg-sub">
            <tr className="text-left text-2xs text-ink-3">
              <th scope="col" className="px-3 py-2 font-medium">动作</th>
              <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">操作者</th>
              <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">对象</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((ev, i) => (
              <tr key={ev.action + ev.createdAt + i} className="state-layer">
                <td className="px-3 py-2">
                  <Pill tone={toneOf(ev.action)}>{ACTION_LABEL[ev.action] ?? ev.action}</Pill>
                </td>
                <td className="hidden max-w-[10rem] truncate px-3 py-2 text-ink-2 sm:table-cell">{ev.actorName ?? "—"}</td>
                <td className="hidden max-w-[12rem] truncate px-3 py-2 text-ink-3 md:table-cell" title={ev.targetId ?? undefined}>
                  {ev.targetId ? ev.targetId.slice(0, 12) : "—"}
                </td>
                <td className="num px-3 py-2 text-right text-xs whitespace-nowrap text-ink-3">{formatDate(ev.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Surface>
  );
}
