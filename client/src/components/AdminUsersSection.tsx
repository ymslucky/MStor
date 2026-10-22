import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Ban, CircleCheck, LogIn, Mail, Pencil, Users } from "lucide-react";
import { listAdminUsers, patchAdminUser } from "../api/me";
import type { AdminUser } from "../api/types";
import { STORAGE_KEYS, setString } from "../lib/storage";
import { formatBytes } from "../lib/format";
import { queryKeys } from "../lib/queryKeys";
import { AsyncState } from "./AsyncState";
import { SearchInput } from "./SearchInput";
import { Button, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, Pill, Surface } from "./ui";

const GB = 1024 ** 3;
const quotaGb = (bytes: number) => Math.round(bytes / GB);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type StatusFilter = "all" | "active" | "disabled";
type PatchBody = Parameters<typeof patchAdminUser>[1];

/** 配额弹窗：校验「大于 0 的整数 GB」，提交后由上层 invalidate ["admin-users"] */
function QuotaDialog({ user, busy, onClose, onSubmit }: { user: AdminUser; busy: boolean; onClose: () => void; onSubmit: (body: PatchBody) => void }) {
  const [val, setVal] = useState(user.quota_bytes == null ? "" : String(quotaGb(user.quota_bytes)));
  const gb = Number(val);
  const valid = Number.isInteger(gb) && gb > 0;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`编辑配额 · ${user.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!valid || busy} onClick={() => onSubmit({ quota_bytes: gb * GB })}>
            保存
          </Button>
        </>
      }
    >
      <Field label="配额（GB）" hint="大于 0 的整数；保存后立即生效" error={!valid ? "须为大于 0 的整数" : undefined}>
        <Input type="number" min="1" step="1" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
      </Field>
    </Dialog>
  );
}

/** 绑定邮箱弹窗：留空保存 = 解绑（Access 首登按绑定邮箱锚定存量账号） */
function EmailDialog({ user, busy, onClose, onSubmit }: { user: AdminUser; busy: boolean; onClose: () => void; onSubmit: (body: PatchBody) => void }) {
  const [val, setVal] = useState(user.email ?? "");
  const trimmed = val.trim();
  const valid = trimmed === "" || EMAIL_RE.test(trimmed);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`绑定邮箱 · ${user.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!valid || busy} onClick={() => onSubmit({ email: trimmed === "" ? null : trimmed })}>
            保存
          </Button>
        </>
      }
    >
      <Field
        label="绑定邮箱"
        hint="留空保存 = 解绑；Cloudflare Access 首登按绑定邮箱锚定存量账号"
        error={!valid ? "邮箱格式不正确" : undefined}
      >
        <Input type="email" value={val} placeholder="name@example.com" onChange={(e) => setVal(e.target.value)} autoFocus />
      </Field>
    </Dialog>
  );
}

function UserRow({ u, selfId, onQuota, onEmail, onDisable }: { u: AdminUser; selfId: string; onQuota: () => void; onEmail: () => void; onDisable: () => void }) {
  const queryClient = useQueryClient();
  const patch = useMutation({
    mutationFn: (body: PatchBody) => patchAdminUser(u.id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers }),
  });
  const disabled = u.disabled_at !== null;
  return (
    <tr className="state-layer border-b border-line last:border-b-0">
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm text-ink">{u.name}</span>
          {u.id === selfId && <Pill tone="accent">我</Pill>}
        </div>
        <p className="truncate text-2xs text-ink-3">{u.email ?? "未绑定邮箱"}</p>
      </td>
      <td className="px-3 py-2">
        <Pill tone={u.platform_admin === 1 ? "accent" : "neutral"}>{u.platform_admin === 1 ? "管理员" : "成员"}</Pill>
      </td>
      <td className="num px-3 py-2 text-sm whitespace-nowrap text-ink-2">
        {u.quota_bytes == null ? "未绑定空间" : formatBytes(u.quota_bytes)}
      </td>
      <td className="px-3 py-2">
        <Pill tone={disabled ? "danger" : "success"}>{disabled ? "已停用" : "正常"}</Pill>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <IconButton
            label={`编辑配额（${u.name}）`}
            disabled={u.quota_bytes == null}
            title={u.quota_bytes == null ? "该用户尚未首次登录，暂无个人空间可配置" : undefined}
            onClick={onQuota}
          >
            <Pencil size={15} aria-hidden />
          </IconButton>
          <IconButton label={`绑定邮箱（${u.name}）`} onClick={onEmail}>
            <Mail size={15} aria-hidden />
          </IconButton>
          {disabled ? (
            <IconButton
              label={`启用（${u.name}）`}
              disabled={patch.isPending}
              onClick={() => patch.mutate({ disabled: false })}
            >
              <CircleCheck size={15} aria-hidden />
            </IconButton>
          ) : (
            <IconButton label={`停用（${u.name}）`} className="text-danger-text" onClick={onDisable}>
              <Ban size={15} aria-hidden />
            </IconButton>
          )}
          <IconButton
            label={`进入空间（${u.name}）`}
            onClick={() => {
              setString(STORAGE_KEYS.actAs, u.id);
              window.location.assign("/");
            }}
          >
            <LogIn size={15} aria-hidden />
          </IconButton>
        </div>
      </td>
    </tr>
  );
}

/**
 * 平台用户管理（/platform/users）：搜索 + 状态筛选 + 表格。
 * 行内不再放输入框：改配额/绑定邮箱走弹窗，停用走二次确认，避免误操作。
 */
export function AdminUsersSection({ selfId }: { selfId: string }) {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: queryKeys.adminUsers, queryFn: listAdminUsers });
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
      const matchStatus = status === "all" || (status === "disabled" ? u.disabled_at !== null : u.disabled_at === null);
      return matchQ && matchStatus;
    });
  }, [users.data, q, status]);

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
            <option value="active">正常</option>
            <option value="disabled">已停用</option>
          </select>
          <span className="num shrink-0 text-2xs text-ink-3">{rows.length} 人</span>
        </div>
      </div>

      <p className="border-b border-line px-3 py-1.5 text-2xs text-ink-3">
        Cloudflare Access 首登按「绑定邮箱」锚定存量账号；关闭自动建号期间，未绑定的新身份会被拒绝。
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
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead className="sticky top-0 bg-bg-sub">
              <tr className="text-left text-2xs text-ink-3">
                <th scope="col" className="px-3 py-2 font-medium">用户</th>
                <th scope="col" className="px-3 py-2 font-medium">角色</th>
                <th scope="col" className="px-3 py-2 font-medium">配额</th>
                <th scope="col" className="px-3 py-2 font-medium">状态</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">操作</th>
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
