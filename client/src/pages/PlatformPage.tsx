import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Users } from "lucide-react";
import type { Me } from "../api/types";
import { getAdminOverview } from "../api/me";
import { AuditTable } from "../components/AuditTable";
import { Skeleton } from "../components/ui";
import { AdminUsersSection } from "./SettingsPage";

type Kind = "users" | "audit";

const COPY: Record<Kind, { title: string; desc: string }> = {
  users: { title: "用户管理", desc: "平台账号、配额与启用状态" },
  audit: { title: "日志审计", desc: "最近 20 条平台操作记录" },
};

/**
 * 平台级页面：用户管理与日志审计（仅平台管理员）。审计页只放审计，不再夹带概览与用量。
 * me 可注入：直接渲染（测试/预览）时没有 Outlet context，注入值优先。
 */
export default function PlatformPage({ kind, me: injected }: { kind: Kind; me?: Me }) {
  const fromOutlet = useOutletContext<Me>();
  const me = injected ?? fromOutlet;
  const account = me.self ?? me;
  const meta = COPY[kind];
  const Icon = kind === "users" ? Users : ShieldCheck;
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: getAdminOverview, enabled: kind === "audit" && account.role === "admin" });

  if (account.role !== "admin") {
    return (
      <div className="md:pb-4">
        <h1 className="mb-3 text-lg font-semibold text-ink">{meta.title}</h1>
        <p className="text-sm text-ink-2">仅平台管理员可访问该页面。</p>
      </div>
    );
  }

  return (
    <div className="md:pb-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Icon size={18} aria-hidden className="text-primary-text" />
          {meta.title}
        </h1>
        <p className="text-2xs text-ink-3">{meta.desc}</p>
      </header>
      {kind === "users" ? (
        <AdminUsersSection selfId={account.id} />
      ) : overview.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <AuditTable events={overview.data?.recentAudit ?? []} />
      )}
    </div>
  );
}
