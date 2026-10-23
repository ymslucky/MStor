import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Users } from "lucide-react";
import type { Me } from "../api/types";
import { getAdminOverview } from "../api/me";
import { AuditTable } from "../components/AuditTable";
import { AsyncState } from "../components/AsyncState";
import { PageHeader } from "../components/layout/PageHeader";
import { AdminUsersSection } from "../components/AdminUsersSection";
import { queryKeys } from "../lib/queryKeys";

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
  const overview = useQuery({
    queryKey: queryKeys.adminOverview,
    queryFn: getAdminOverview,
    enabled: kind === "audit" && account.role === "admin",
    meta: { silent: true },
  });

  if (account.role !== "admin") {
    return (
      <div className="md:pb-4">
        <PageHeader title={meta.title} description="仅平台管理员可访问该页面。" />
      </div>
    );
  }

  return (
    <div className={kind === "audit" ? "md:flex md:min-h-0 md:flex-1 md:flex-col md:pb-4" : "md:pb-4"}>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Icon size={18} aria-hidden className="text-primary-text" />
            {meta.title}
          </span>
        }
        description={meta.desc}
      />
      {kind === "users" ? (
        <AdminUsersSection selfId={account.id} />
      ) : (
        <AsyncState query={overview} skeletonRows={5}>
          <AuditTable events={overview.data?.recentAudit ?? []} />
        </AsyncState>
      )}
    </div>
  );
}
