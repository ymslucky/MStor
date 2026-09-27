import { api } from "./client";
import type { AdminUser, Me } from "./types";

export const getMe = () => api<Me>("/api/me");
export const setWebdavPassword = (password: string) => api<{ ok: true }>("/api/me/webdav-password", { method: "PUT", json: { password } });
export const listAdminUsers = () => api<{ users: AdminUser[] }>("/api/me/admin/users");
export const patchAdminUser = (
  id: string,
  body: { quota_bytes?: number; role?: "admin" | "member"; disabled?: boolean },
) => api<{ ok: true }>(`/api/me/admin/users/${id}`, { method: "PATCH", json: body });
