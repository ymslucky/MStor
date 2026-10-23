import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleCheck, LogIn, Mail, Pencil } from "lucide-react";
import { patchAdminUser, startActAs } from "../../api/me";
import { friendlyMessage } from "../../api/client";
import { toast } from "../Toaster";
import type { AdminUser } from "../../api/types";
import { formatBytes } from "../../lib/format";
import { queryKeys } from "../../lib/queryKeys";
import { STORAGE_KEYS, setString } from "../../lib/storage";
import { IconButton, Pill } from "../ui";
import type { PatchBody } from "./shared";

/** 用户表格行：角色/配额/状态展示 + 行内动作（停用走上层二次确认） */
export function UserRow({
  u,
  selfId,
  onQuota,
  onEmail,
  onDisable,
}: {
  u: AdminUser;
  selfId: string;
  onQuota: () => void;
  onEmail: () => void;
  onDisable: () => void;
}) {
  const queryClient = useQueryClient();
  const patch = useMutation({
    mutationFn: (body: PatchBody) => patchAdminUser(u.id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers }),
  });
  const enter = useMutation({
    mutationFn: () => startActAs(u.id),
    onSuccess: () => {
      setString(STORAGE_KEYS.actAs, u.id);
      window.location.assign("/");
    },
    onError: (e) => toast(friendlyMessage(e), "error"),
  });
  const disabled = u.disabled_at !== null;
  return (
    <tr className="state-layer border-b border-line last:border-b-0">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm text-ink">{u.name}</span>
          {u.id === selfId && <Pill tone="accent">我</Pill>}
        </div>
        <p className="truncate text-2xs text-ink-3">{u.email ?? "未绑定邮箱"}</p>
      </td>
      <td className="px-3 py-2.5">
        <Pill tone={u.platform_admin === 1 ? "accent" : "neutral"}>{u.platform_admin === 1 ? "管理员" : "成员"}</Pill>
      </td>
      <td className="num px-3 py-2.5 text-sm whitespace-nowrap text-ink-2">
        {u.quota_bytes == null ? "未绑定空间" : formatBytes(u.quota_bytes)}
      </td>
      <td className="px-3 py-2.5">
        <Pill tone={disabled ? "danger" : "success"}>{disabled ? "已停用" : "正常"}</Pill>
      </td>
      <td className="px-3 py-2.5">
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
          {u.id !== selfId && (
            <IconButton
              label={`进入空间（${u.name}）`}
              disabled={enter.isPending}
              onClick={() => enter.mutate()}
            >
              <LogIn size={15} aria-hidden />
            </IconButton>
          )}
        </div>
      </td>
    </tr>
  );
}
