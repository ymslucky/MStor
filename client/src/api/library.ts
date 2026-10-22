import type { Node } from "./types";
import { api } from "./client";

export interface TagRow {
  id: string;
  name: string;
  color?: string | null;
  count?: number;
}

/** 收藏（工作区内当前用户） */
export const listFavorites = () => api<{ nodes: Node[] }>("/api/library/favorites");

/** 收藏 / 取消收藏（幂等） */
export const addFavorite = (nodeId: string) =>
  api<{ ok: true }>(`/api/library/favorites/${nodeId}`, { method: "PUT" });

export const removeFavorite = (nodeId: string) =>
  api<{ ok: true }>(`/api/library/favorites/${nodeId}`, { method: "DELETE" });

/** 最近访问 */
export const listRecent = () => api<{ nodes: Node[] }>("/api/library/recent");

/** 记录一次访问（最近访问来源；服务端对同节点 5 分钟内节流） */
export const recordView = (nodeId: string) =>
  api<{ ok: true }>(`/api/library/views/${nodeId}`, { method: "POST" });

/** 标签清单 */
export const listTags = () => api<{ tags: TagRow[] }>("/api/library/tags");

/** 某标签下的文件 */
export const listTagged = (tagId: string) => api<{ nodes: Node[] }>(`/api/library/tags/${tagId}/nodes`);
