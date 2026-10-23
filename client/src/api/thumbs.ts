import { api } from "./client";
import { STORAGE_KEYS, getString } from "../lib/storage";

/** 缩略图读取地址（内容不可变，服务端给 immutable 缓存头） */
export const thumbUrl = (nodeId: string) => {
  const actAs = getString(STORAGE_KEYS.actAs);
  return `/api/files/${nodeId}/thumb${actAs ? `?act_as=${encodeURIComponent(actAs)}` : ""}`;
};

/** 上传客户端生成的 WebP 缩略图（服务端限 512KB 且必须是 image/*） */
export const uploadThumb = (nodeId: string, blob: Blob) =>
  api<{ ok: true; bytes: number }>(`/api/files/${nodeId}/thumb`, {
    method: "POST",
    body: blob,
    headers: { "content-type": blob.type || "image/webp" },
  });
