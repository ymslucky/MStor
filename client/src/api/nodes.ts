import { api } from "./client";
import { STORAGE_KEYS, getString } from "../lib/storage";
import { purgeNode } from "./trash";
import type { ListFilesResult, Node } from "./types";

export const listFiles = (parentId: string) =>
  api<ListFilesResult>(`/api/files${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ""}`);

export interface DirTreeRow {
  id: string;
  parent_id: string;
  name: string;
  path: string;
}

/** 目录树（移动/复制目标选择）：一次请求返回全部目录，truncated 表示超过服务端上限 */
export const listDirTree = () => api<{ dirs: DirTreeRow[]; truncated: boolean }>("/api/dirs/tree");

export const createDir = (body: { parentId?: string; name: string }) =>
  api<Node>("/api/dirs", { method: "POST", json: body });

// 幂等建目录（嵌套上传逐级建目录用）：同名活跃目录复用，否则新建
export const ensureDir = (body: { parentId?: string; name: string }) =>
  api<Node>("/api/dirs/ensure", { method: "POST", json: body });

export const undoOperation = (undoId: string) => api<{ ok: true }>(`/api/files/operations/${undoId}/undo`, { method: "POST" });

export const copyNode = (id: string, parentId?: string) =>
  api<{ id: string; created: number }>(`/api/files/${id}/copy`, { method: "POST", json: { parentId } });

export const renameNode = (id: string, name: string) =>
  api<{ ok: true; undoId?: string }>(`/api/files/${id}`, { method: "PATCH", json: { name } });

export const moveNode = (id: string, parentId: string) =>
  api<{ ok: true; undoId?: string }>(`/api/files/${id}`, { method: "PATCH", json: { parentId } });

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

export const contentUrl = (id: string, dl = false) => {
  // 图片/视频/下载走浏览器原生 URL，无法带 x-act-as 头；act-as 时用查询参数
  const params = new URLSearchParams();
  if (dl) params.set("dl", "1");
  const actAs = getString(STORAGE_KEYS.actAs);
  if (actAs) params.set("act_as", actAs);
  const qs = params.toString();
  return `/api/files/${id}/content${qs ? `?${qs}` : ""}`;
};
