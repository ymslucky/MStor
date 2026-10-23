import { api } from "./client";
import type { AdminUser, Me } from "./types";

export const getMe = () => api<Me>("/api/me");
// 用户管理是全局操作，与 act-as 空间无关：skipActAs 避免头被 session 中间件切换掉 admin 身份
export const listAdminUsers = () =>
  api<{ users: AdminUser[] }>("/api/me/admin/users", { skipActAs: true });

/** 进入他人空间：只记录一次 admin.act_as（x-act-as 仅作为后续请求上下文） */
export const startActAs = (userId: string) =>
  api<{ ok: true }>("/api/me/admin/act-as", { method: "POST", json: { userId }, skipActAs: true });

export const patchAdminUser = (
  id: string,
  body: { quota_bytes?: number; role?: "admin" | "member"; disabled?: boolean; approved?: boolean; name?: string; email?: string | null },
) => api<{ ok: true }>(`/api/me/admin/users/${id}`, { method: "PATCH", json: body, skipActAs: true });

/** 管理台一屏聚合：人/空间/存储/审计（服务端 5 条语句一次返回） */
export interface AdminOverview {
  users: { total: number; disabled: number; unbound: number };
  workspaces: { total: number; usedBytes: number };
  topWorkspaces: { id: string; name: string; usedBytes: number; quotaBytes: number; members: number; nodes: number }[];
  recentAudit: {
    action: string;
    actorId: string | null;
    actorName: string | null;
    targetId: string | null;
    workspaceId: string | null;
    createdAt: number;
  }[];
}

export const getAdminOverview = () => api<AdminOverview>("/api/me/admin/overview", { skipActAs: true });

// 动态配置（admin）：回收站保留天数等，白名单键由服务端校验
export interface AdminSettings {
  trash_retention_days: number;
  audit_enabled: boolean;
  registration_enabled: boolean;
  registration_requires_approval: boolean;
  default_quota_bytes: number;
}

export const getAdminSettings = () => api<AdminSettings>("/api/me/admin/settings", { skipActAs: true });

export const patchAdminSettings = (body: {
  trash_retention_days?: number;
  audit_enabled?: boolean;
  registration_enabled?: boolean;
  registration_requires_approval?: boolean;
  default_quota_bytes?: number;
}) =>
  api<{ ok: true }>("/api/me/admin/settings", { method: "PATCH", json: body, skipActAs: true });
