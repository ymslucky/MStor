import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { createInvitation, listInvitations, listMembers, removeMember, revokeInvitation, updateMemberRole } from "../api/workspaces";
import { formatDate } from "../lib/format";
import { Button, GlassCard, Input } from "./ui";
import { toast } from "./Toaster";

const ROLE_LABEL: Record<string, string> = { owner: "所有者", admin: "管理员", member: "成员" };

/**
 * 空间成员与邀请：仅 owner/admin 可见（服务端同样校验，前端只决定是否渲染）。
 * 邀请链接由服务端签发，需人工转达——本项目不发事务邮件（方案 §0.2 双重簿记）。
 */
export function MemberPanel() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const changeRole = async (userId: string, next: "admin" | "member") => {
    setBusy(userId);
    try {
      await updateMemberRole(userId, next);
      await queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "修改角色失败");
    } finally {
      setBusy(null);
    }
  };

  const removeNow = async (userId: string) => {
    setBusy(userId);
    try {
      await removeMember(userId);
      await queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "移除成员失败");
    } finally {
      setBusy(null);
    }
  };
  const members = useQuery({ queryKey: ["members"], queryFn: listMembers });
  const invites = useQuery({ queryKey: ["invitations"], queryFn: listInvitations });

  const invite = useMutation({
    mutationFn: () => createInvitation(email.trim(), role),
    onSuccess: async (r) => {
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
      // 链接只此一次可见：直接放进提示，让管理员立刻转达
      toast(`邀请已创建：${r.url}`, "info");
    },
    onError: (e) => toast(e instanceof Error ? e.message : "邀请失败", "error"),
  });

  const revoke = useMutation({
    mutationFn: (tokenOrEmail: string) => revokeInvitation(tokenOrEmail),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast("邀请已撤销", "info");
    },
    onError: (e) => toast(e instanceof Error ? e.message : "撤销失败", "error"),
  });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <h2 className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
          <UserPlus size={16} aria-hidden />
          邀请成员
        </h2>
        <p className="mb-3 text-xs text-ink-3">
          受邀者需先在 Cloudflare Access 侧被放行（GitHub 登录），首次登录后自动加入本空间。
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) invite.mutate();
          }}
        >
          <label className="min-w-48 flex-1">
            <span className="mb-1 block text-xs text-ink-3">邮箱</span>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" type="email" />
          </label>
          <label>
            <span className="mb-1 block text-xs text-ink-3">角色</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "member")}
              className="min-h-[44px] rounded-xl border border-line bg-white px-3 text-sm text-ink"
            >
              <option value="member">成员</option>
              <option value="admin">管理员</option>
            </select>
          </label>
          <Button type="submit" disabled={invite.isPending || !email.trim()}>
            生成邀请链接
          </Button>
        </form>
      </GlassCard>

      <GlassCard className="p-4">
        <h2 className="mb-3 font-semibold text-ink">成员（{members.data?.members.length ?? 0}）</h2>
        {members.isLoading ? (
          <p className="text-sm text-ink-3">加载中…</p>
        ) : (
          <ul className="divide-y divide-line">
            {(members.data?.members ?? []).map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink">{m.name}</div>
                  <div className="truncate text-xs text-ink-3">{m.email ?? "（未提供邮箱）"}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    aria-label={`修改 ${m.name} 的角色`}
                    value={m.role}
                    disabled={m.role === "owner" || busy === m.user_id}
                    onChange={(e) => void changeRole(m.user_id, e.target.value as "admin" | "member")}
                    className="rounded-btn border border-line bg-surface-1 px-2 py-1 text-xs text-ink disabled:opacity-50"
                  >
                    <option value="owner">所有者</option>
                    <option value="admin">管理员</option>
                    <option value="member">成员</option>
                  </select>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={m.role === "owner" || busy === m.user_id}
                    onClick={() => void removeNow(m.user_id)}
                  >
                    移除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <h2 className="mb-3 font-semibold text-ink">待接受的邀请</h2>
        {invites.isLoading ? (
          <p className="text-sm text-ink-3">加载中…</p>
        ) : (invites.data?.invitations.length ?? 0) === 0 ? (
          <p className="text-sm text-ink-3">暂无待接受邀请</p>
        ) : (
          <ul className="divide-y divide-line">
            {(invites.data?.invitations ?? []).map((inv) => (
              <li key={inv.email} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink">{inv.email}</div>
                  <div className="text-xs text-ink-3">
                    {ROLE_LABEL[inv.role] ?? inv.role} · {formatDate(inv.expires_at)} 过期
                  </div>
                </div>
                <Button variant="ghost" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(inv.email)}>
                  撤销
                </Button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
