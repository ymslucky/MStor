import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { listAdminUsers, patchAdminUser } from "../api/me";
import type { AdminUser } from "../api/types";
import { queryKeys } from "../lib/queryKeys";
import { AsyncState } from "./AsyncState";
import { EmailDialog } from "./admin/EmailDialog";
import { QuotaDialog } from "./admin/QuotaDialog";
import { type PatchBody, type StatusFilter } from "./admin/shared";
import { UserRow } from "./admin/UserRow";
import { SearchInput } from "./SearchInput";
import { Button, ConfirmDialog, EmptyState, Surface } from "./ui";

/**
 * 平台用户管理（/platform/users）：搜索 + 状态筛选 + 表格。
 * 行内不再放输入框：改配额/绑定邮箱走弹窗，停用走二次确认，避免误操作。
 * 弹窗与表格行拆到 components/admin/*，本文件只保留查询、筛选与编排。
 */
export function AdminUsersSection({ selfId }: { selfId: string }) {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: queryKeys.adminUsers, queryFn: listAdminUsers, meta: { silent: true } });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [quotaUser, setQuotaUser] = useState<AdminUser | null>(null);
  const [emailUser, setEmailUser] = useState<AdminUser | null>(null);
  const [disableUser, setDisableUser] = useState<AdminUser | null>(null);

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: PatchBody }) => patchAdminUser(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers }),
  });

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return (users.data?.users ?? []).filter((u) => {
      const matchQ = !kw || u.name.toLowerCase().includes(kw) || (u.email ?? "").toLowerCase().includes(kw);
      const matchStatus =
        status === "all" ||
        (status === "disabled"
          ? u.disabled_at !== null
          : status === "pending"
            ? u.approved_at === null
            : u.disabled_at === null && u.approved_at !== null);
      return matchQ && matchStatus;
    });
  }, [users.data, status, q]);

  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <SearchInput label="搜索用户" placeholder="按名字或邮箱搜索…" value={q} onChange={setQ} className="w-56" />
        <div className="flex items-center gap-2">
          <select
            aria-label="状态筛选"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="h-8 rounded-btn border border-line bg-surface-1 px-2 text-xs text-ink"
          >
            <option value="all">全部</option>
            <option value="pending">待审核</option>
            <option value="active">正常</option>
            <option value="disabled">已停用</option>
          </select>
          <span className="num shrink-0 text-2xs text-ink-3">{rows.length} 人</span>
        </div>
      </div>

      <p className="border-b border-line px-3 py-1.5 text-2xs text-ink-3">
        Cloudflare Access 首登按「绑定邮箱」锚定存量账号；开启审核时，新账号需在此通过审核后才能使用。
      </p>

      <AsyncState query={users} skeletonRows={4} skeletonClassName="p-3">
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={users.data?.users.length ? "没有匹配的用户" : "还没有平台用户"}
            description={users.data?.users.length ? "换个关键字，或把状态筛选改回「全部」" : "Cloudflare Access 首登后会自动建号"}
            action={
              users.data?.users.length ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQ("");
                    setStatus("all");
                  }}
                >
                  清除筛选
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-2xs tracking-wide text-ink-3 uppercase">
                  <th scope="col" className="sticky top-0 z-sticky border-b border-line bg-bg-sub px-3 py-2 font-medium">用户</th>
                  <th scope="col" className="sticky top-0 z-sticky border-b border-line bg-bg-sub px-3 py-2 font-medium">角色</th>
                  <th scope="col" className="sticky top-0 z-sticky border-b border-line bg-bg-sub px-3 py-2 font-medium">配额</th>
                  <th scope="col" className="sticky top-0 z-sticky border-b border-line bg-bg-sub px-3 py-2 font-medium">状态</th>
                  <th scope="col" className="sticky top-0 z-sticky border-b border-line bg-bg-sub px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <UserRow
                    key={u.id}
                    u={u}
                    selfId={selfId}
                    onQuota={() => setQuotaUser(u)}
                    onEmail={() => setEmailUser(u)}
                    onDisable={() => setDisableUser(u)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncState>

      {quotaUser && (
        <QuotaDialog
          key={quotaUser.id}
          user={quotaUser}
          busy={patch.isPending}
          onClose={() => setQuotaUser(null)}
          onSubmit={(body) => patch.mutate({ id: quotaUser.id, body }, { onSuccess: () => setQuotaUser(null) })}
        />
      )}
      {emailUser && (
        <EmailDialog
          key={emailUser.id}
          user={emailUser}
          busy={patch.isPending}
          onClose={() => setEmailUser(null)}
          onSubmit={(body) => patch.mutate({ id: emailUser.id, body }, { onSuccess: () => setEmailUser(null) })}
        />
      )}
      <ConfirmDialog
        open={disableUser !== null}
        danger
        title={`停用用户 · ${disableUser?.name ?? ""}`}
        description="停用后该账号将立即无法登录（云端 Access 身份仍然有效，重新启用即可恢复）。确定继续吗？"
        confirmText="停用"
        busy={patch.isPending}
        onConfirm={() => {
          const target = disableUser;
          setDisableUser(null);
          if (target) patch.mutate({ id: target.id, body: { disabled: true } });
        }}
        onCancel={() => setDisableUser(null)}
      />
    </Surface>
  );
}
