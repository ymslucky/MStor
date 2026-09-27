import { api } from "./client";
import type { SearchResult } from "./types";

export const searchNodes = (q: string) => api<SearchResult>(`/api/search?q=${encodeURIComponent(q)}`);
