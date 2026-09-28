import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CloudUpload, HardDrive, UserRound, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getAdminSettings, listAdminUsers, patchAdminSettings, patchAdminUser, setWebdavPassword } from "../api/me";
import type { AdminUser, Me } from "../api/types";
import { DEFAULT_UPLOAD_CONCURRENCY, MAX_UPLOAD_CONCURRENCY, MIN_UPLOAD_CONCURRENCY, getUploadConcurrency, setUploadConcurrency } from "../lib/settings";
import { formatDate } from "../lib/format";
import { toast } from "../components/Toaster";
import { Button, GlassCard, Input } from "../components/ui";

type TabKey = "account" | "upload" | "admin";

const TABS: { key: TabKey; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { key: "account", label: "账户", icon: UserRound },
  { key: "upload", label: "上传", icon: CloudUpload },
  { key: "admin", label: "管理", icon: Users, adminOnly: true },
];

function TabBar({ tabs, active, onChange }: { tabs: typeof TABS; active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <div role="tablist" aria-label="设置分类" className="mb-4 flex items-center gap-1 border-b border-line">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-t-xl px-4 text-sm font-medium transition-colors ${
              isActive ? "border-b-2 border-primary text-primary-text" : "text-ink-2 hover:text-ink"
            }`}
            onClick={() => onChange(t.key)}
          >
            <Icon size={16} aria-hidden />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

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
      <h2 className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
        <HardDrive size={16} aria-hidden className="text-primary-text" />
        WebDAV
      </h2>
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
        {!valid && <span className="text-xs text-danger">须为 {MIN_UPLOAD_CONCURRENCY}-{MAX_UPLOAD_CONCURRENCY} 的整数</span>}
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
        {days !== null && !valid && <span className="text-xs text-danger">须为 1-365 的整数</span>}
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

function AdminUsersSection({ selfId }: { selfId: string }) {
  const users = useQuery({ queryKey: ["admin-users"], queryFn: listAdminUsers });
  return (
    <GlassCard className="p-4">
      <h2 className="mb-3 flex items-center gap-1.5 font-semibold text-ink">
        <Users size={16} aria-hidden className="text-primary-text" />
        用户管理
      </h2>
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
          {users.data?.users.map((u) => <AdminRow key={u.id} u={u} selfId={selfId} />)}
        </tbody>
      </table>
    </GlassCard>
  );
}

export default function SettingsPage({ me }: { me: Me }) {
  // 管理面板看登录账号角色（self）：act-as 查看他人空间时 admin 身份不变
  const account = me.self ?? me;
  const tabs = TABS.filter((t) => !t.adminOnly || account.role === "admin");
  const [tab, setTab] = useState<TabKey>("account");
  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold text-ink">设置</h1>
      <TabBar tabs={tabs} active={tab} onChange={setTab} />
      <div className="space-y-4">
        {tab === "account" && <WebdavSection />}
        {tab === "upload" && <UploadSection />}
        {tab === "admin" && account.role === "admin" && (
          <>
            <AdminUsersSection selfId={account.id} />
            <TrashRetentionSection />
          </>
        )}
      </div>
    </div>
  );
}
