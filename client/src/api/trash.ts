import { api } from "./client";
import type { TrashResult } from "./types";

export const listTrash = () => api<TrashResult>("/api/trash");
export const restoreNode = (id: string) => api<{ ok: true }>(`/api/trash/${id}/restore`, { method: "POST" });
export const purgeNode = (id: string) => api<{ ok: true }>(`/api/trash/${id}`, { method: "DELETE" });

export interface BatchTrashResult {
  ok: true;
  restored?: number;
  purged?: number;
  failed: { id: string; reason: string }[];
}

// 批量还原/彻底删除：单项失败不阻断，失败清单在 failed 里
export const batchRestore = (ids: string[]) =>
  api<BatchTrashResult>("/api/trash/batch-restore", { method: "POST", json: { ids } });
export const batchPurge = (ids: string[]) =>
  api<BatchTrashResult>("/api/trash/batch-purge", { method: "POST", json: { ids } });
