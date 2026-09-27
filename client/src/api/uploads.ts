import { ApiError, api } from "./client";
import type { InitUpload } from "./types";

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
  let done = 0;
  let next = 1;
  const worker = async () => {
    while (next <= totalParts) {
      const partNumber = next++;
      parts.push({
        partNumber,
        etag: await putPartWithRetry(file, uploadId, partNumber, partSize, baseDelayMs, opts?.signal),
      });
      onProgress?.(++done / totalParts);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, totalParts) }, worker));
  return api<{ nodeId: string; name: string }>(`/api/uploads/${uploadId}/complete`, {
    method: "POST",
    json: { parts, mime: file.type || undefined },
  });
}

// spec §7.1：分片失败自动重试 3 次（指数退避），超限抛错由队列标记失败；取消（signal）不重试直接抛出
async function putPartWithRetry(
  file: File,
  uploadId: string,
  partNumber: number,
  partSize: number,
  baseDelayMs = 1000,
  signal?: AbortSignal,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new DOMException("上传已取消", "AbortError");
    try {
      const { urls } = await api<{ urls: string[] }>(`/api/uploads/${uploadId}/part-urls`, {
        method: "POST",
        json: { partNumbers: [partNumber] },
      });
      const start = (partNumber - 1) * partSize;
      const blob = file.slice(start, Math.min(start + partSize, file.size));
      const res = await fetch(urls[0], { method: "PUT", body: blob, signal });
      if (!res.ok) throw new Error(`分片 ${partNumber} 直传失败：${res.status}`);
      return res.headers.get("etag") ?? (await res.text());
    } catch (e) {
      if (signal?.aborted || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
}

export const abortUpload = (uploadId: string) => api<{ ok: true }>(`/api/uploads/${uploadId}`, { method: "DELETE" });
