import { useOutletContext } from "react-router-dom";
import { ShieldCheck, Users } from "lucide-react";
import type { Me } from "../api/types";
import { AdminOverviewSection } from "../components/AdminOverviewSection";
import { AdminUsersSection } from "./SettingsPage";

type Kind = "users" | "audit";

const COPY: Record<Kind, { title: string; desc: string }> = {
  users: { title: "用户管理", desc: "平台账号、配额与启用状态（仅平台管理员）" },
  audit: { title: "日志审计", desc: "平台概览与审计事件（仅平台管理员）" },
};

/** 平台级页面：用户管理与日志审计从「设置」拆出，作为独立的平台域 */
export default function PlatformPage({ kind }: { kind: Kind }) {
  const me = useOutletContext<Me>();
  const account = me.self ?? me;
  const meta = COPY[kind];
  const Icon = kind === "users" ? Users : ShieldCheck;

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
      {kind === "users" ? <AdminUsersSection selfId={account.id} /> : <AdminOverviewSection />}
    </div>
  );
}
