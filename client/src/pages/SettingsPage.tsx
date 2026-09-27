import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listAdminUsers, patchAdminUser, setWebdavPassword } from "../api/me";
import type { AdminUser, Me } from "../api/types";
import { formatDate } from "../lib/format";
import { toast } from "../components/Toaster";
import { Button, GlassCard, Input } from "../components/ui";

function WebdavSection() {
  const [password, setPassword] = useState("");
  const save = useMutation({
    mutationFn: (password: string) => setWebdavPassword(password),
    onSuccess: () => {
      toast("WebDAV 密码已更新", "info");
      setPassword("");
    },
  });
  return (
    <GlassCard className="p-4">
      <h2 className="mb-1 font-semibold text-ink">WebDAV</h2>
      <p className="mb-3 text-xs text-ink-dim">
        地址 <code>/dav/</code>，用户名同登录名；在 Windows 映射驱动器 / iOS 文件 App 中使用。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="WebDAV 应用密码"
          type="password"
          placeholder="至少 8 位"
          className="sm:w-56"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button
          disabled={password.length < 8 || save.isPending}
          onClick={() => save.mutate(password)}
        >
          保存密码
        </Button>
        {password.length > 0 && password.length < 8 && <span className="text-xs text-danger">密码至少 8 位</span>}
      </div>
    </GlassCard>
  );
}

function AdminRow({ u, selfId }: { u: AdminUser; selfId: string }) {
  const queryClient = useQueryClient();
  const [gb, setGb] = useState(String(Math.round(u.quota_bytes / 1024 ** 3)));
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
        {u.disabled_at && <span className="ml-1 text-xs text-danger">已停用</span>}
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
      <td className="hidden py-2 text-xs text-ink-faint md:table-cell">{formatDate(u.created_at)}</td>
      <td className="py-2 text-right">
        <Button
          variant="ghost"
          size="sm"
          className="mr-2"
          onClick={() => {
            localStorage.setItem("mstor_act_as", u.id);
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

export default function SettingsPage({ me }: { me: Me }) {
  const users = useQuery({ queryKey: ["admin-users"], queryFn: listAdminUsers, enabled: me.role === "admin" });
  return (
    <div className="space-y-4">
      <WebdavSection />
      {me.role === "admin" && (
        <GlassCard className="p-4">
          <h2 className="mb-3 font-semibold text-ink">用户管理</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-faint">
              <tr className="border-b border-line">
                <th className="py-2 font-medium">用户</th>
                {/* 次要列（角色/注册）移动端隐藏 */}
                <th className="hidden py-2 font-medium sm:table-cell">角色</th>
                <th className="py-2 font-medium">配额</th>
                <th className="hidden py-2 font-medium md:table-cell">注册</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {users.data?.users.map((u) => <AdminRow key={u.id} u={u} selfId={me.id} />)}
            </tbody>
          </table>
        </GlassCard>
      )}
    </div>
  );
}
