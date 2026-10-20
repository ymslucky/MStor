import { api } from "./client";
import type { SearchResult } from "./types";

export type SearchSort = "recent" | "name" | "size";
export type SearchKind = "all" | "file" | "dir";

export interface SearchParams {
  q: string;
  sort?: SearchSort;
  type?: SearchKind;
  min?: number;
  max?: number;
  limit?: number;
  cursor?: string;
}

/** 目录名 + 文件名搜索（服务端 FTS5 trigram；sort/type/尺寸区间/游标均由服务端支持） */
export const searchNodes = (params: string | SearchParams) => {
  const p: SearchParams = typeof params === "string" ? { q: params } : params;
  const qs = new URLSearchParams({ q: p.q });
  if (p.sort && p.sort !== "recent") qs.set("sort", p.sort);
  if (p.type && p.type !== "all") qs.set("type", p.type);
  if (p.min != null) qs.set("min", String(p.min));
  if (p.max != null) qs.set("max", String(p.max));
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.cursor) qs.set("cursor", p.cursor);
  return api<SearchResult>("/api/search?" + qs.toString());
};
