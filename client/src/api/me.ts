import { api } from "./client";
import type { AdminUser, Me } from "./types";

export const getMe = () => api<Me>("/api/me");
export const setWebdavPassword = (password: string) => api<{ ok: true }>("/api/me/webdav-password", { method: "PUT", json: { password } });
// 用户管理是全局操作，与 act-as 空间无关：skipActAs 避免头被 session 中间件切换掉 admin 身份
export const listAdminUsers = () =>
  api<{ users: AdminUser[] }>("/api/me/admin/users", { skipActAs: true });

export const patchAdminUser = (
  id: string,
  body: { quota_bytes?: number; role?: "admin" | "member"; disabled?: boolean; name?: string },
) => api<{ ok: true }>(`/api/me/admin/users/${id}`, { method: "PATCH", json: body, skipActAs: true });

// 动态配置（admin）：回收站保留天数等，白名单键由服务端校验
export const getAdminSettings = () =>
  api<{ trash_retention_days: number }>("/api/me/admin/settings", { skipActAs: true });

export const patchAdminSettings = (body: { trash_retention_days: number }) =>
  api<{ ok: true }>("/api/me/admin/settings", { method: "PATCH", json: body, skipActAs: true });
