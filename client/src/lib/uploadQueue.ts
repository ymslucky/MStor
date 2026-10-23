import { STORAGE_KEYS, getJSON, removeItem, setJSON } from "./storage";

/** 队列重启快照：只存元数据，不存 File（浏览器不允许恢复本地文件句柄）。 */
export interface PersistedQueueItem {
  key: number;
  name: string;
  path?: string;
  size: number;
  parentId: string;
  lastModified: number;
  fingerprint?: string;
  status: "pending" | "uploading" | "paused" | "error" | "needs-file";
  progress: number;
  uploadId?: string;
  error?: string;
}

const MAX_ITEMS = 200;

export function loadQueueSnapshot(): PersistedQueueItem[] {
  const raw = getJSON<unknown>(STORAGE_KEYS.uploadQueue, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it): it is PersistedQueueItem => {
      if (!it || typeof it !== "object") return false;
      const x = it as Record<string, unknown>;
      return typeof x.key === "number" && typeof x.name === "string" && typeof x.size === "number" && typeof x.parentId === "string";
    })
    .slice(0, MAX_ITEMS);
}

export function saveQueueSnapshot(items: PersistedQueueItem[]): void {
  if (!items.length) {
    removeItem(STORAGE_KEYS.uploadQueue);
    return;
  }
  setJSON(STORAGE_KEYS.uploadQueue, items.slice(0, MAX_ITEMS));
}

export function clearQueueSnapshot(): void {
  removeItem(STORAGE_KEYS.uploadQueue);
}
