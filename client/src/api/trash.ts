import { api } from "./client";
import type { TrashResult } from "./types";

export const listTrash = () => api<TrashResult>("/api/trash");
export const restoreNode = (id: string) => api<{ ok: true }>(`/api/trash/${id}/restore`, { method: "POST" });
export const purgeNode = (id: string) => api<{ ok: true }>(`/api/trash/${id}`, { method: "DELETE" });
