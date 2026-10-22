import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { CloudUpload, UserPlus, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getAdminSettings, patchAdminSettings } from "../api/me";
import type { Me } from "../api/types";
import { MAX_UPLOAD_CONCURRENCY, MIN_UPLOAD_CONCURRENCY, getUploadConcurrency, setUploadConcurrency } from "../lib/settings";
import { formatBytes } from "../lib/format";
import { queryKeys } from "../lib/queryKeys";
import { toast } from "../components/Toaster";
import { PageHeader } from "../components/layout/PageHeader";
import { MemberPanel } from "../components/MemberPanel";
import { Button, Field, Input, Pill, SettingRow, Surface } from "../components/ui";

/** 设置只剩三个分区：平台管理能力已迁到 /platform/users、/platform/audit */
type TabKey = "account" | "upload" | "members";

const TABS: { key: TabKey; label: string; icon: LucideIcon; workspaceOnly?: boolean }[] = [
  { key: "account", label: "账户", icon: UserRound },
  { key: "upload", label: "上传", icon: CloudUpload },
  { key: "members", label: "成员", icon: UserPlus, workspaceOnly: true },
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
  return (
    <Surface className="p-4">
      <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-ink">
        <UserRound size={16} aria-hidden className="text-primary-text" />
        账户信息
      </h2>
      <SettingRow title="登录名" hint="Cloudflare Access 身份锚点">
        <p className="text-sm text-ink">{account.name}</p>
      </SettingRow>
      <SettingRow title="角色" hint="平台级角色，决定能否进入管理台">
        <div>
          <Pill tone={account.role === "admin" ? "accent" : "neutral"}>
            {account.role === "admin" ? "管理员" : "成员"}
          </Pill>
        </div>
      </SettingRow>
      <SettingRow title="存储用量" hint="按逻辑字节计；R2 去重不影响配额">
        <p className="text-sm text-ink num">
          {formatBytes(me.usedBytes)} / {formatBytes(me.quotaBytes)}
        </p>
      </SettingRow>
      <SettingRow title="回收站保留" hint="超过保留天数的回收站项会被每日清理任务彻底删除">
        <p className="text-sm text-ink num">{me.trashRetentionDays} 天</p>
      </SettingRow>
    </Surface>
  );
}

// 回收站保留天数：服务端动态配置（settings 表），清理任务读取，未配置回退 env
function TrashRetentionRow() {
  const query = useQuery({ queryKey: queryKeys.adminSettings, queryFn: getAdminSettings });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSettings });
      // 同步回收站页描述文字（读取 /api/me 的 trashRetentionDays）
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
  return (
    <SettingRow title="回收站保留天数" hint="超过该天数的回收站项将被每日清理任务彻底删除（1-365 天）">
      <Field
        label="保留天数"
        hint="1-365 天"
        error={days !== null && !valid ? "须为 1-365 的整数" : undefined}
        className="max-w-40"
      >
        <Input type="number" min="1" max="365" value={days ?? ""} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
        保存保留天数
      </Button>
    </SettingRow>
  );
}

function UploadSection({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  // 本地偏好：上传并发数（分片与文件队列共用），保存后对新上传任务生效
  const [n, setN] = useState(String(getUploadConcurrency()));
  const parsed = Number(n);
  const valid = Number.isInteger(parsed) && parsed >= MIN_UPLOAD_CONCURRENCY && parsed <= MAX_UPLOAD_CONCURRENCY;
  const save = () => {
    setUploadConcurrency(parsed);
    toast(`上传并发已设为 ${parsed}`, "info");
  };
  return (
    <Surface className="p-4">
      <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-ink">
        <CloudUpload size={16} aria-hidden className="text-primary-text" />
        上传
      </h2>
      <SettingRow
        title="上传并发"
        hint={`同时上传的文件数（${MIN_UPLOAD_CONCURRENCY}-${MAX_UPLOAD_CONCURRENCY}）；每个大文件最多 4 个分片并发。调大可提升吞吐，但占用更多带宽；保存后对新的上传任务生效。`}
      >
        <Field
          label="并发数"
          hint={`${MIN_UPLOAD_CONCURRENCY}-${MAX_UPLOAD_CONCURRENCY}（保存后对新任务生效）`}
          error={!valid ? `须为 ${MIN_UPLOAD_CONCURRENCY}-${MAX_UPLOAD_CONCURRENCY} 的整数` : undefined}
          className="max-w-40"
        >
          <Input type="number" min={MIN_UPLOAD_CONCURRENCY} max={MAX_UPLOAD_CONCURRENCY} value={n} onChange={(e) => setN(e.target.value)} />
        </Field>
        <Button disabled={!valid || parsed === getUploadConcurrency()} onClick={save}>
          保存并发数
        </Button>
      </SettingRow>
      {/* 回收站保留期属平台级配置，仅平台管理员可见（服务端同样校验） */}
      {isPlatformAdmin && <TrashRetentionRow />}
    </Surface>
  );
}

export default function SettingsPage({ me }: { me: Me }) {
  // 管理面板看登录账号角色（self）：act-as 查看他人空间时 admin 身份不变
  const account = me.self ?? me;
  // 成员管理按「当前空间角色」放行（owner/admin）
  const workspaceRole = me.workspace?.role ?? "member";
  const tabs = TABS.filter((t) => !t.workspaceOnly || workspaceRole !== "member");
  // 设置分区由子路由决定（可深链、可后退）；非法路径回落到账户页
  const { pathname } = useLocation();
  const seg = pathname.split("/")[2] ?? "account";
  const tab: TabKey = (["account", "upload", "members"] as const).includes(seg as TabKey)
    ? (seg as TabKey)
    : "account";
  return (
    <div className="md:pb-4">
      <PageHeader title="设置" description="账户、上传与空间成员管理" />
      <TabBar tabs={tabs} active={tab} />
      <div className="space-y-4">
        {tab === "account" && <AccountSection me={me} />}
        {tab === "upload" && <UploadSection isPlatformAdmin={account.role === "admin"} />}
        {tab === "members" && workspaceRole !== "member" && <MemberPanel />}
      </div>
    </div>
  );
}
