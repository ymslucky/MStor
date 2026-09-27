import { api } from "./client";
import type { ListFilesResult, Node } from "./types";

export const listFiles = (parentId: string) =>
  api<ListFilesResult>(`/api/files${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ""}`);

export const createDir = (body: { parentId?: string; name: string }) =>
  api<Node>("/api/dirs", { method: "POST", json: body });

export const renameNode = (id: string, name: string) =>
  api<{ ok: true }>(`/api/files/${id}`, { method: "PATCH", json: { name } });

export const moveNode = (id: string, parentId: string) =>
  api<{ ok: true }>(`/api/files/${id}`, { method: "PATCH", json: { parentId } });

export const deleteNode = (id: string) =>
  api<{ ok: true }>(`/api/files/${id}`, { method: "DELETE" });

export const contentUrl = (id: string, dl = false) => `/api/files/${id}/content${dl ? "?dl=1" : ""}`;
