// 客户端本地偏好（localStorage）：上传并发数
import { STORAGE_KEYS, getString, setString } from "./storage";

export const MIN_UPLOAD_CONCURRENCY = 1;
export const MAX_UPLOAD_CONCURRENCY = 16;
export const DEFAULT_UPLOAD_CONCURRENCY = 3;
/** 单个大文件的分片并发上限：队列并发 N 个文件时，实际 XHR 峰值为 N × min(N, 该值)，避免 16×16 打爆连接 */
export const MAX_PART_CONCURRENCY = 4;

const clamp = (n: number) => Math.min(MAX_UPLOAD_CONCURRENCY, Math.max(MIN_UPLOAD_CONCURRENCY, n));

export function getUploadConcurrency(): number {
  const raw = getString(STORAGE_KEYS.uploadConcurrency);
  if (raw === null) return DEFAULT_UPLOAD_CONCURRENCY;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_UPLOAD_CONCURRENCY;
  return clamp(Math.round(n));
}

export function setUploadConcurrency(n: number): void {
  setString(STORAGE_KEYS.uploadConcurrency, String(clamp(Math.round(n))));
}
