import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Users } from "lucide-react";
import { listAdminUsers, patchAdminUser } from "../api/me";
import type { AdminUser } from "../api/types";
import { STORAGE_KEYS, setString } from "../lib/storage";
import { formatDate } from "../lib/format";
import { Button, Input, Surface } from "./ui";

/** 平台用户管理（仅平台管理员）：从设置页迁出，挂在 /platform/users */
function AdminRow({ u, selfId }: { u: AdminUser; selfId: string }) {
  const queryClient = useQueryClient();
  const [gb, setGb] = useState(String(Math.round(u.quota_bytes / 1024 ** 3)));
  const [email, setEmail] = useState(u.email ?? "");
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  const patch = useMutation({
    mutationFn: (body: Parameters<typeof patchAdminUser>[1]) => patchAdminUser(u.id, body),
    onSuccess: invalidate,
  });
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="py-2 text-ink">
        {u.name}
        {u.id === selfId && <span className="ml-1 text-xs text-ink-faint">（我）</span>}
        {u.disabled_at && <span className="ml-1 text-xs text-danger-text">已停用</span>}
      </td>
      <td className="hidden py-2 text-xs sm:table-cell">{u.role}</td>
      <td className="py-2">
        <Input
          aria-label={`配额 GB（${u.name}）`}
          type="number"
          min="0"
          className="w-24!"
          value={gb}
          onChange={(e) => setGb(e.target.value)}
        />
        <button
          className="ml-2 text-xs text-accent hover:underline"
          onClick={() => patch.mutate({ quota_bytes: Math.max(0, Number(gb)) * 1024 ** 3 })}
        >
          保存配额（{u.name}）
        </button>
      </td>
      <td className="py-2">
        <Input
          aria-label={`绑定邮箱（${u.name}）`}
          type="email"
          className="w-44!"
          value={email}
          placeholder="未绑定"
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          className="ml-2 text-xs text-accent hover:underline disabled:text-ink-faint"
          disabled={email.trim() === (u.email ?? "")}
          onClick={() => patch.mutate({ email: email.trim() === "" ? null : email.trim() })}
        >
          保存邮箱（{u.name}）
        </button>
        {email.trim() === "" && !!u.email && <span className="ml-1 text-xs text-ink-faint">留空保存 = 解绑</span>}
      </td>
      <td className="hidden py-2 text-xs text-ink-faint md:table-cell">{formatDate(u.created_at)}</td>
      <td className="py-2 text-right">
        <Button
          variant="ghost"
          size="sm"
          className="mr-2"
          onClick={() => {
            setString(STORAGE_KEYS.actAs, u.id);
            window.location.assign("/");
          }}
        >
          进入空间
        </Button>
        <button
          className={u.disabled_at ? "text-accent hover:underline" : "text-danger hover:underline"}
          onClick={() => patch.mutate({ disabled: !u.disabled_at })}
        >
          {u.disabled_at ? "启用" : "停用"}
        </button>
      </td>
    </tr>
  );
}

export function AdminUsersSection({ selfId }: { selfId: string }) {
  const users = useQuery({ queryKey: ["admin-users"], queryFn: listAdminUsers });
  return (
    <Surface className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
        <Users size={16} aria-hidden className="text-primary-text" />
        用户管理
      </h2>
      <p className="mb-3 text-xs text-ink-faint">Cloudflare Access 首登按「绑定邮箱」锚定存量账号；关闭自动建号期间，未绑定的新身份会被拒绝。</p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-faint">
          <tr className="border-b border-line">
            <th className="py-2 font-medium">用户</th>
            <th className="hidden py-2 font-medium sm:table-cell">角色</th>
            <th className="py-2 font-medium">配额</th>
            <th className="py-2 font-medium">绑定邮箱</th>
            <th className="hidden py-2 font-medium md:table-cell">注册</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {users.data?.users.map((u) => <AdminRow key={u.id} u={u} selfId={selfId} />)}
        </tbody>
      </table>
    </Surface>
  );
}
