import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { CloudUpload, UserPlus, UserRound, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getAdminSettings, listAdminUsers, patchAdminSettings, patchAdminUser } from "../api/me";
import type { AdminUser, Me } from "../api/types";
import { MAX_UPLOAD_CONCURRENCY, MIN_UPLOAD_CONCURRENCY, getUploadConcurrency, setUploadConcurrency } from "../lib/settings";
import { STORAGE_KEYS, setString } from "../lib/storage";
import { formatBytes, formatDate } from "../lib/format";
import { toast } from "../components/Toaster";
import { MemberPanel } from "../components/MemberPanel";
import { AdminOverviewSection } from "../components/AdminOverviewSection";
import { Button, GlassCard, Input } from "../components/ui";

type TabKey = "account" | "upload" | "members" | "admin";

const TABS: { key: TabKey; label: string; icon: LucideIcon; adminOnly?: boolean; workspaceOnly?: boolean }[] = [
  { key: "account", label: "账户", icon: UserRound },
  { key: "upload", label: "上传", icon: CloudUpload },
  { key: "members", label: "成员", icon: UserPlus, workspaceOnly: true },
  { key: "admin", label: "管理", icon: Users, adminOnly: true },
];

function TabBar({ tabs, active }: { tabs: typeof TABS; active: TabKey }) {
  return (
    <nav aria-label="设置分类" className="mb-4 flex flex-wrap items-center gap-1 border-b border-line">
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <NavLink
            key={t.key}
            to={`/settings/${t.key}`}
            aria-current={active === t.key ? "page" : undefined}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-t-xl px-4 text-sm font-medium transition-colors ${
              active === t.key ? "border-b-2 border-primary text-primary-text" : "text-ink-2 hover:text-ink"
            }`}
          >
            <Icon size={16} aria-hidden />
            {t.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function AccountSection({ me }: { me: Me }) {
  // 展示登录账号（self）：act-as 查看他人空间时当前空间用户与登录账号不同
  const account = me.self ?? me;
  const rows: { label: string; value: string }[] = [
    { label: "登录名", value: account.name },
    { label: "角色", value: account.role === "admin" ? "管理员" : "成员" },
    { label: "存储用量", value: `${formatBytes(me.usedBytes)} / ${formatBytes(me.quotaBytes)}` },
    { label: "回收站保留", value: `${me.trashRetentionDays} 天` },
  ];
  return (
    <GlassCard className="p-4">
      <h2 className="mb-3 flex items-center gap-1.5 font-semibold text-ink">
        <UserRound size={16} aria-hidden className="text-primary-text" />
        账户信息
      </h2>
      <dl className="space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4">
            <dt className="shrink-0 text-ink-dim">{r.label}</dt>
            <dd className="break-all text-right font-medium text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
    </GlassCard>
  );
}

function UploadSection() {
  // 本地偏好：上传并发数（分片与文件队列共用），保存后对新上传任务生效
  const [n, setN] = useState(String(getUploadConcurrency()));
  const parsed = Number(n);
  const valid = Number.isInteger(parsed) && parsed >= MIN_UPLOAD_CONCURRENCY && parsed <= MAX_UPLOAD_CONCURRENCY;
  const save = () => {
    setUploadConcurrency(parsed);
    toast(`上传并发已设为 ${parsed}`, "info");
  };
  return (
    <GlassCard className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
        <CloudUpload size={16} aria-hidden className="text-primary-text" />
        上传并发
      </h2>
      <p className="mb-3 text-xs text-ink-dim">
        同时上传的分片 / 文件数（{MIN_UPLOAD_CONCURRENCY}-{MAX_UPLOAD_CONCURRENCY}）。调大可提升吞吐，但占用更多带宽；保存后对新的上传任务生效。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="上传并发数"
          type="number"
          min={MIN_UPLOAD_CONCURRENCY}
          max={MAX_UPLOAD_CONCURRENCY}
          className="w-24!"
          value={n}
          onChange={(e) => setN(e.target.value)}
        />
        <Button disabled={!valid || parsed === getUploadConcurrency()} onClick={save}>
          保存
        </Button>
        {!valid && <span className="text-xs text-danger-text">须为 {MIN_UPLOAD_CONCURRENCY}-{MAX_UPLOAD_CONCURRENCY} 的整数</span>}
      </div>
    </GlassCard>
  );
}

// 回收站保留天数：服务端动态配置（settings 表），清理任务读取，未配置回退 env
function TrashRetentionSection() {
  const query = useQuery({ queryKey: ["admin-settings"], queryFn: getAdminSettings });
  const queryClient = useQueryClient();
  // 服务端值加载后一次性回填；null = 尚未加载，避免受控回填与用户输入冲突
  const [days, setDays] = useState<string | null>(null);
  useEffect(() => {
    if (query.data && days === null) setDays(String(query.data.trash_retention_days));
  }, [query.data, days]);
  const parsed = Number(days);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 365;
  const save = useMutation({
    mutationFn: () => patchAdminSettings({ trash_retention_days: parsed }),
    onSuccess: () => {
      toast("回收站保留天数已更新", "info");
      void queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      // 同步回收站页描述文字（读取 /api/me 的 trashRetentionDays）
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
  return (
    <GlassCard className="p-4">
      <h2 className="mb-1 font-semibold text-ink">回收站保留天数</h2>
      <p className="mb-3 text-xs text-ink-dim">超过该天数的回收站项将被每日清理任务彻底删除（1-365 天）。</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="回收站保留天数"
          type="number"
          min="1"
          max="365"
          className="w-24!"
          value={days ?? ""}
          onChange={(e) => setDays(e.target.value)}
        />
        <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
          保存
        </Button>
        {days !== null && !valid && <span className="text-xs text-danger-text">须为 1-365 的整数</span>}
      </div>
    </GlassCard>
  );
}

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

function AdminUsersSection({ selfId }: { selfId: string }) {
  const users = useQuery({ queryKey: ["admin-users"], queryFn: listAdminUsers });
  return (
    <GlassCard className="p-4">
      <h2 className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
        <Users size={16} aria-hidden className="text-primary-text" />
        用户管理
      </h2>
      <p className="mb-3 text-xs text-ink-faint">Cloudflare Access 首登按「绑定邮箱」锚定存量账号；关闭自动建号期间，未绑定的新身份会被拒绝。</p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-faint">
          <tr className="border-b border-line">
            <th className="py-2 font-medium">用户</th>
            {/* 次要列（角色/注册）移动端隐藏 */}
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
    </GlassCard>
  );
}

export default function SettingsPage({ me }: { me: Me }) {
  // 管理面板看登录账号角色（self）：act-as 查看他人空间时 admin 身份不变
  const account = me.self ?? me;
  // 成员管理按「当前空间角色」放行（owner/admin），平台管理员面板按 platform_admin
  const workspaceRole = me.workspace?.role ?? "member";
  const tabs = TABS.filter((t) => (!t.adminOnly || account.role === "admin") && (!t.workspaceOnly || workspaceRole !== "member"));
  // 设置分区由子路由决定（可深链、可后退）；非法路径回落到账户页
  const { pathname } = useLocation();
  const seg = pathname.split("/")[2] ?? "account";
  const tab: TabKey = (["account", "upload", "members", "admin"] as const).includes(seg as TabKey) ? (seg as TabKey) : "account";
  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold text-ink">设置</h1>
      <TabBar tabs={tabs} active={tab} />
      <div className="space-y-4">
        {tab === "account" && <AccountSection me={me} />}
        {tab === "upload" && <UploadSection />}
        {tab === "members" && workspaceRole !== "member" && <MemberPanel />}
        {tab === "admin" && account.role === "admin" && (
          <>
            <AdminOverviewSection />
            <AdminUsersSection selfId={account.id} />
            <TrashRetentionSection />
          </>
        )}
      </div>
    </div>
  );
}
