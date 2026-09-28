import { api } from "./client";
import { purgeNode } from "./trash";
import type { ListFilesResult, Node } from "./types";

export const listFiles = (parentId: string) =>
  api<ListFilesResult>(`/api/files${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ""}`);

export const createDir = (body: { parentId?: string; name: string }) =>
  api<Node>("/api/dirs", { method: "POST", json: body });

// 幂等建目录（嵌套上传逐级建目录用）：同名活跃目录复用，否则新建
export const ensureDir = (body: { parentId?: string; name: string }) =>
  api<Node>("/api/dirs/ensure", { method: "POST", json: body });

export const renameNode = (id: string, name: string) =>
  api<{ ok: true }>(`/api/files/${id}`, { method: "PATCH", json: { name } });

export const moveNode = (id: string, parentId: string) =>
  api<{ ok: true }>(`/api/files/${id}`, { method: "PATCH", json: { parentId } });

export const deleteNode = (id: string) =>
  api<{ ok: true }>(`/api/files/${id}`, { method: "DELETE" });

// 浏览器内彻底删除：先软删（进回收站语义）再 purge（purge 仅对软删态生效）
export async function deleteNodePermanently(id: string): Promise<void> {
  await deleteNode(id);
  await purgeNode(id);
}

// 批量删除（服务端一次处理一批，无逐项往返）；permanent 时软删后立即 purge
export const batchDeleteNodes = (ids: string[], permanent = false) =>
  api<{ ok: true; deleted: number; failed: { id: string; reason: string }[] }>("/api/files/batch-delete", {
    method: "POST",
    json: { ids, permanent },
  });

// 批量移动
export const batchMoveNodes = (ids: string[], parentId: string) =>
  api<{ ok: true; moved: number; failed: { id: string; reason: string }[] }>("/api/files/batch-move", {
    method: "POST",
    json: { ids, parentId },
  });

export const contentUrl = (id: string, dl = false) => `/api/files/${id}/content${dl ? "?dl=1" : ""}`;
