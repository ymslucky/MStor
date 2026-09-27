import { api } from "./client";
import type { PublicNode, Share, ShareInfo } from "./types";

export const createShare = (body: { nodeId: string; expiresInDays?: number; password?: string }) =>
  api<{ token: string; url: string }>("/api/shares", { method: "POST", json: body });

export const listShares = () => api<{ shares: Share[] }>("/api/shares");

export const revokeShare = (id: string) => api<{ ok: true }>(`/api/shares/${id}`, { method: "DELETE" });

// 公开分享（无需登录）：401 SHARE_PASSWORD / 410 SHARE_EXPIRED 由调用方按 code 分流
export const fetchShare = (token: string, password?: string) =>
  api<ShareInfo>(`/api/s/${token}`, password ? { headers: { "x-share-password": password } } : {});

export const fetchShareChildren = (token: string, dirId: string, password?: string) =>
  api<{ name: string; children: PublicNode[] }>(`/api/s/${token}/children/${dirId}`, password ? { headers: { "x-share-password": password } } : {});

// 受保护分享的下载无法用 <a> 带 header，统一走 blob
export async function downloadShared(token: string, fileId: string, name: string, password?: string): Promise<void> {
  const res = await fetch(`/api/s/${token}/raw/${fileId}`, password ? { headers: { "x-share-password": password } } : {});
  if (!res.ok) throw new Error("下载失败");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
