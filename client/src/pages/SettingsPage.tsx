import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { CloudUpload, Globe, ShieldCheck, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getAdminSettings, patchAdminSettings } from "../api/me";
import { friendlyMessage } from "../api/client";
import type { Me } from "../api/types";
import { MAX_UPLOAD_CONCURRENCY, MIN_UPLOAD_CONCURRENCY, getUploadConcurrency, setUploadConcurrency } from "../lib/settings";
import { formatBytes } from "../lib/format";
import { queryKeys } from "../lib/queryKeys";
import { toast } from "../components/Toaster";
import { PageHeader } from "../components/layout/PageHeader";
import { Button, Field, Input, Pill, SettingRow, Surface } from "../components/ui";

/** 设置只有个人账户/上传/平台访问/审计；每个用户一个私有空间，不提供成员共享 UI */
type TabKey = "account" | "upload" | "access" | "audit";

const TABS: { key: TabKey; label: string; icon: LucideIcon; platformOnly?: boolean }[] = [
  { key: "account", label: "账户", icon: UserRound },
  { key: "upload", label: "上传", icon: CloudUpload },
  { key: "access", label: "访问", icon: Globe, platformOnly: true },
  { key: "audit", label: "审计", icon: ShieldCheck, platformOnly: true },
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

/** 平台级审计开关：关闭后服务端停止写入新审计，历史记录保留 */
function AuditEnabledRow() {
  const query = useQuery({ queryKey: queryKeys.adminSettings, queryFn: getAdminSettings });
  const queryClient = useQueryClient();
  const enabled = query.data?.audit_enabled ?? true;
  const save = useMutation({
    mutationFn: (next: boolean) => patchAdminSettings({ audit_enabled: next }),
    onSuccess: (_data, next) => {
      toast(next ? "审计日志已开启" : "审计日志已关闭（历史记录保留）", "info");
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSettings });
    },
    onError: (e) => toast(friendlyMessage(e), "error"),
  });
  return (
    <SettingRow title="审计日志" hint="记录管理员、分享、文件删除等高风险动作；关闭后不再写入新事件，历史记录保留。">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="h-4 w-4 accent-ink"
          checked={enabled}
          disabled={query.isPending || save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
        />
        <span>{enabled ? "已开启" : "已关闭"}</span>
      </label>
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

function RegistrationRow() {
  const query = useQuery({ queryKey: queryKeys.adminSettings, queryFn: getAdminSettings });
  const queryClient = useQueryClient();
  const enabled = query.data?.registration_enabled ?? true;
  const save = useMutation({
    mutationFn: (next: boolean) => patchAdminSettings({ registration_enabled: next }),
    onSuccess: (_data, next) => {
      toast(next ? "已允许新用户注册" : "已关闭新用户注册", "info");
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSettings });
    },
    onError: (e) => toast(friendlyMessage(e), "error"),
  });
  return (
    <SettingRow title="允许新用户注册" hint="Cloudflare Access 验证通过但尚未建号的用户是否自动创建账号；关闭后仅现有账号可登录。">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="h-4 w-4 accent-ink"
          checked={enabled}
          disabled={query.isPending || save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
        />
        <span>{enabled ? "允许注册" : "仅现有账号"}</span>
      </label>
    </SettingRow>
  );
}

function RegistrationApprovalRow() {
  const query = useQuery({ queryKey: queryKeys.adminSettings, queryFn: getAdminSettings });
  const queryClient = useQueryClient();
  const enabled = query.data?.registration_requires_approval ?? true;
  const save = useMutation({
    mutationFn: (next: boolean) => patchAdminSettings({ registration_requires_approval: next }),
    onSuccess: (_data, next) => {
      toast(next ? "新注册账号需要管理员审核" : "新注册账号将自动通过", "info");
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSettings });
    },
    onError: (e) => toast(friendlyMessage(e), "error"),
  });
  return (
    <SettingRow title="注册后需要审核" hint="开启后新账号先进入待审核状态，管理员在「用户管理」通过后才能使用；关闭则注册即用。">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="h-4 w-4 accent-ink"
          checked={enabled}
          disabled={query.isPending || save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
        />
        <span>{enabled ? "需要审核" : "自动通过"}</span>
      </label>
    </SettingRow>
  );
}

function DefaultQuotaRow() {
  const query = useQuery({ queryKey: queryKeys.adminSettings, queryFn: getAdminSettings });
  const queryClient = useQueryClient();
  const [gb, setGb] = useState<string | null>(null);
  useEffect(() => {
    if (query.data && gb === null) setGb(String(Math.round(query.data.default_quota_bytes / 1024 ** 3)));
  }, [query.data, gb]);
  const parsed = Number(gb);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 1024;
  const save = useMutation({
    mutationFn: () => patchAdminSettings({ default_quota_bytes: parsed * 1024 ** 3 }),
    onSuccess: () => {
      toast("默认空间额度已更新（仅影响新注册用户）", "info");
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSettings });
    },
    onError: (e) => toast(friendlyMessage(e), "error"),
  });
  return (
    <SettingRow title="新用户默认空间额度" hint="首次注册的个人空间额度；已有空间不会被追溯修改（1-1024 GB）。">
      <Field label="额度（GB）" hint="默认 1 GB" error={gb !== null && !valid ? "须为 1-1024 的整数" : undefined} className="max-w-40">
        <Input type="number" min="1" max="1024" value={gb ?? ""} onChange={(e) => setGb(e.target.value)} />
      </Field>
      <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
        保存默认额度
      </Button>
    </SettingRow>
  );
}

function AccessSection() {
  return (
    <Surface className="p-4">
      <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-ink">
        <Globe size={16} aria-hidden className="text-primary-text" />
        访问与注册
      </h2>
      <RegistrationRow />
      <RegistrationApprovalRow />
      <DefaultQuotaRow />
    </Surface>
  );
}

function AuditSection() {
  return (
    <Surface className="p-4">
      <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-ink">
        <ShieldCheck size={16} aria-hidden className="text-primary-text" />
        审计日志
      </h2>
      <AuditEnabledRow />
    </Surface>
  );
}

export default function SettingsPage({ me }: { me: Me }) {
  // 管理面板看登录账号角色（self）：act-as 查看他人空间时 admin 身份不变
  const account = me.self ?? me;
  const tabs = TABS.filter((t) => !t.platformOnly || account.role === "admin");
  // 设置分区由子路由决定（可深链、可后退）；非法路径或无权路径回落到账户页
  const { pathname } = useLocation();
  const seg = pathname.split("/")[2] ?? "account";
  const known = (["account", "upload", "access", "audit"] as const).includes(seg as TabKey);
  const platformOnly = seg === "access" || seg === "audit";
  const tab: TabKey = known && (!platformOnly || account.role === "admin") ? (seg as TabKey) : "account";
  return (
    <div className="mx-auto w-full max-w-3xl md:pb-4">
      <PageHeader title="设置" description="账户、上传、访问与审计" />
      <TabBar tabs={tabs} active={tab} />
      <div className="space-y-4">
        {tab === "account" && <AccountSection me={me} />}
        {tab === "upload" && <UploadSection isPlatformAdmin={account.role === "admin"} />}
        {tab === "access" && account.role === "admin" && <AccessSection />}
        {tab === "audit" && account.role === "admin" && <AuditSection />}
      </div>
    </div>
  );
}
