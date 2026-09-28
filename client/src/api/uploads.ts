import { ApiError, api } from "./client";
import type { InitUpload } from "./types";
import { DEFAULT_UPLOAD_CONCURRENCY } from "../lib/settings";

// 与后端 wrangler.jsonc 的 SMALL_FILE_LIMIT 同步（60MB）
export const SMALL_FILE_LIMIT = 60 * 1024 * 1024;

export interface UploadSmallOpts {
  /** 取消上传：中止 XHR */
  signal?: AbortSignal;
  /** 上传进度（0-1） */
  onProgress?: (ratio: number) => void;
}

// 小文件直传：fetch 无上传进度事件，用 XHR（xhr.upload.onprogress）+ abort 支持；
// 错误语义与 api() 对齐（401 → ApiError，非 2xx 解析 error envelope，x-act-as 透传）
export const uploadSmall = (file: File, parentId: string, opts?: UploadSmallOpts) =>
  new Promise<{ id: string; name: string; size: number }>((resolve, reject) => {
    const qs = new URLSearchParams({ name: file.name, parentId });
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/files/upload?${qs}`);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    if (typeof localStorage !== "undefined") {
      const actAs = localStorage.getItem("mstor_act_as");
      if (actAs) xhr.setRequestHeader("x-act-as", actAs);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts?.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as { id: string; name: string; size: number });
        } catch {
          reject(new ApiError(xhr.status, "INTERNAL", "响应解析失败"));
        }
        return;
      }
      if (xhr.status === 401) {
        reject(new ApiError(401, "UNAUTHORIZED", "请先登录"));
        return;
      }
      let code = "INTERNAL";
      let message = "请求失败";
      try {
        const data = JSON.parse(xhr.responseText) as { error?: { code?: string; message?: string } };
        code = data.error?.code ?? code;
        message = data.error?.message ?? message;
      } catch {
        // 非 JSON 错误体，保留默认文案
      }
      reject(new ApiError(xhr.status, code, message));
    };
    xhr.onerror = () => reject(new ApiError(0, "NETWORK", "网络错误"));
    xhr.onabort = () => reject(new DOMException("上传已取消", "AbortError"));
    if (opts?.signal) {
      if (opts.signal.aborted) {
        xhr.abort();
        return;
      }
      opts.signal.addEventListener("abort", () => xhr.abort());
    }
    xhr.send(file);
  });

export interface Part {
  partNumber: number;
  etag: string;
}

export interface UploadLargeOpts {
  /** 取消上传：中止在途分片请求（服务端 multipart 由调用方 abortUpload 清理） */
  signal?: AbortSignal;
  /** init 拿到 uploadId 后回调（队列记录用于取消时清理服务端分片） */
  onUploadId?: (uploadId: string) => void;
  /** 分片并发 worker 数（默认 3；设置页可调 1-16，实际取 min(并发, 分片数)） */
  concurrency?: number;
}

export async function uploadLarge(
  file: File,
  parentId: string,
  onProgress?: (ratio: number) => void,
  baseDelayMs = 1000,
  opts?: UploadLargeOpts,
): Promise<{ nodeId: string; name: string }> {
  const { uploadId, partSize } = await api<InitUpload>("/api/uploads", {
    method: "POST",
    json: { parentId, name: file.name, size: file.size, mime: file.type || undefined },
  });
  opts?.onUploadId?.(uploadId);
  const totalParts = Math.ceil(file.size / partSize);
  const parts: Part[] = [];
  // 字节级进度聚合：每分片记录已传字节（重试时归零重计），求和后按总字节回传
  const loadedByPart = new Map<number, number>();
  const emit = () => {
    let sum = 0;
    for (const v of loadedByPart.values()) sum += v;
    onProgress?.(Math.min(1, sum / file.size));
  };
  let next = 1;
  const worker = async () => {
    while (next <= totalParts) {
      const partNumber = next++;
      const partBytes = Math.min(partNumber * partSize, file.size) - (partNumber - 1) * partSize;
      parts.push({
        partNumber,
        etag: await putPartWithRetry(file, uploadId, partNumber, partSize, baseDelayMs, opts?.signal, (loaded) => {
          loadedByPart.set(partNumber, loaded);
          emit();
        }),
      });
      loadedByPart.set(partNumber, partBytes);
      emit();
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts?.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY, totalParts) }, worker));
  return api<{ nodeId: string; name: string }>(`/api/uploads/${uploadId}/complete`, {
    method: "POST",
    json: { parts, mime: file.type || undefined },
  });
}

// spec §7.1：分片失败自动重试 3 次（指数退避），超限抛错由队列标记失败；取消（signal）不重试直接抛出。
// 分片 PUT 用 XHR（fetch 无上传进度事件）：upload.onprogress 字节级回传，供速度/进度条实时显示。
async function putPartWithRetry(
  file: File,
  uploadId: string,
  partNumber: number,
  partSize: number,
  baseDelayMs = 1000,
  signal?: AbortSignal,
  onLoaded?: (loaded: number) => void,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new DOMException("上传已取消", "AbortError");
    onLoaded?.(0); // 重试重新计数字节
    try {
      const { urls } = await api<{ urls: string[] }>(`/api/uploads/${uploadId}/part-urls`, {
        method: "POST",
        json: { partNumbers: [partNumber] },
      });
      const start = (partNumber - 1) * partSize;
      const blob = file.slice(start, Math.min(start + partSize, file.size));
      return await putPart(blob, partNumber, urls[0], signal, onLoaded);
    } catch (e) {
      if (signal?.aborted || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
}

// 单分片直传（R2 预签名 URL，跨域）：CORS exposeHeaders 已含 etag，XHR 可读
function putPart(
  blob: Blob,
  partNumber: number,
  url: string,
  signal: AbortSignal | undefined,
  onLoaded?: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onLoaded?.(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader("etag") ?? xhr.responseText);
        return;
      }
      reject(new Error(`分片 ${partNumber} 直传失败：${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error(`分片 ${partNumber} 直传网络错误`));
    xhr.onabort = () => reject(new DOMException("上传已取消", "AbortError"));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort());
    }
    xhr.send(blob);
  });
}

export const abortUpload = (uploadId: string) => api<{ ok: true }>(`/api/uploads/${uploadId}`, { method: "DELETE" });
