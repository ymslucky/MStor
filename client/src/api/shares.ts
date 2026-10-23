import { api } from "./client";
import type { PublicNode, Share, ShareInfo } from "./types";

export const createShare = (body: { nodeId: string; expiresInDays?: number; password?: string; maxDownloads?: number; oneTime?: boolean }) =>
  api<{ token: string; url: string }>("/api/shares", { method: "POST", json: body });

export const listShares = () => api<{ shares: Share[] }>("/api/shares");

export const revokeShare = (id: string) => api<{ ok: true }>(`/api/shares/${id}`, { method: "DELETE" });

// 批量撤销：单项失败不阻断，失败清单在 failed 里
export const batchRevokeShares = (ids: string[]) =>
  api<{ ok: true; revoked: number; failed: { id: string; reason: string }[] }>("/api/shares/batch-revoke", {
    method: "POST",
    json: { ids },
  });

// 公开分享（无需登录）：401 SHARE_PASSWORD / 410 SHARE_EXPIRED 由调用方按 code 分流
export const fetchShare = (token: string, password?: string) =>
  api<ShareInfo>(`/api/s/${token}`, password ? { headers: { "x-share-password": password } } : {});

export const fetchShareChildren = (token: string, dirId: string, password?: string) =>
  api<{ name: string; children: PublicNode[] }>(`/api/s/${token}/children/${dirId}`, password ? { headers: { "x-share-password": password } } : {});

// 公开分享统一走直链：密码分享在解锁响应里已签发 HttpOnly 会话 cookie。
// 不再用 fetch+blob，避免大文件把整个文件读进浏览器内存。
export async function downloadShared(token: string, fileId: string, name: string, _password?: string): Promise<void> {
  const a = document.createElement("a");
  a.href = `/api/s/${token}/raw/${fileId}?dl=1`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
