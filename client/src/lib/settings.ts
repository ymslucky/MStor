// 客户端本地偏好（localStorage）：上传并发数
const KEY = "mstor_upload_concurrency";

export const MIN_UPLOAD_CONCURRENCY = 1;
export const MAX_UPLOAD_CONCURRENCY = 16;
export const DEFAULT_UPLOAD_CONCURRENCY = 3;

const clamp = (n: number) => Math.min(MAX_UPLOAD_CONCURRENCY, Math.max(MIN_UPLOAD_CONCURRENCY, n));

export function getUploadConcurrency(): number {
  if (typeof localStorage === "undefined") return DEFAULT_UPLOAD_CONCURRENCY;
  const raw = localStorage.getItem(KEY);
  if (raw === null) return DEFAULT_UPLOAD_CONCURRENCY;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_UPLOAD_CONCURRENCY;
  return clamp(Math.round(n));
}

export function setUploadConcurrency(n: number): void {
  localStorage.setItem(KEY, String(clamp(Math.round(n))));
}
