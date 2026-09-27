import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listAdminUsers, patchAdminUser, setWebdavPassword } from "../api/me";
import type { AdminUser, Me } from "../api/types";
import { formatDate } from "../lib/format";
import { toast } from "../components/Toaster";

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
    <section className="rounded-lg border bg-white p-4">
      <h2 className="mb-1 font-semibold">WebDAV</h2>
      <p className="mb-3 text-xs text-slate-500">
        地址 <code>/dav/</code>，用户名同登录名；在 Windows 映射驱动器 / iOS 文件 App 中使用。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="WebDAV 应用密码"
          type="password"
          placeholder="至少 8 位"
          className="w-56 rounded border px-2 py-1.5 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={password.length < 8 || save.isPending}
          onClick={() => save.mutate(password)}
        >
          保存密码
        </button>
        {password.length > 0 && password.length < 8 && <span className="text-xs text-red-500">密码至少 8 位</span>}
      </div>
    </section>
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
    <tr className="border-b">
      <td className="py-2">
        {u.name}
        {u.id === selfId && <span className="ml-1 text-xs text-slate-400">（我）</span>}
        {u.disabled_at && <span className="ml-1 text-xs text-red-500">已停用</span>}
      </td>
      <td className="py-2 text-xs">{u.role}</td>
      <td className="py-2">
        <input
          aria-label={`配额 GB（${u.name}）`}
          type="number"
          min="0"
          className="w-24 rounded border px-2 py-1 text-sm"
          value={gb}
          onChange={(e) => setGb(e.target.value)}
        />
        <button
          className="ml-2 text-xs text-blue-600 hover:underline"
          onClick={() => patch.mutate({ quota_bytes: Math.max(0, Number(gb)) * 1024 ** 3 })}
        >
          保存配额（{u.name}）
        </button>
      </td>
      <td className="py-2 text-xs text-slate-400">{formatDate(u.created_at)}</td>
      <td className="py-2 text-right">
        <button
          className="mr-3 text-slate-600 hover:underline"
          onClick={() => {
            localStorage.setItem("mstor_act_as", u.id);
            window.location.assign("/");
          }}
        >
          进入空间
        </button>
        <button
          className={u.disabled_at ? "text-blue-600 hover:underline" : "text-red-600 hover:underline"}
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
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 font-semibold">用户管理</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b">
                <th className="py-2">用户</th>
                <th className="py-2">角色</th>
                <th className="py-2">配额</th>
                <th className="py-2">注册</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {users.data?.users.map((u) => <AdminRow key={u.id} u={u} selfId={me.id} />)}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
