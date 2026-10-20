import { api } from "./client";

export interface Notification {
  id: string;
  workspace_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: number | null;
  created_at: number;
}

export const listNotifications = () => api<{ items: Notification[]; unread: number }>("/api/notifications");

export const markNotificationRead = (id: string) =>
  api<{ ok: true }>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });

export const markAllNotificationsRead = () =>
  api<{ ok: true; marked: number }>("/api/notifications/read-all", { method: "POST" });
