import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { SMALL_FILE_LIMIT, abortUpload, uploadLarge, uploadSmall } from "../api/uploads";

export type QueueStatus = "pending" | "uploading" | "done" | "error";

export interface QueueItem {
  key: number;
  name: string;
  size: number;
  parentId: string;
  file: File;
  status: QueueStatus;
  progress: number;
  error?: string;
  /** 大文件 init 后记录，取消时调用 abortUpload 清理服务端分片 */
  uploadId?: string;
}

export function useUploadQueue() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef<QueueItem[]>([]);
  const seq = useRef(0);
  const running = useRef(false);
  // 取消：在途分片请求 AbortController + 已取消标记（结果落地时保持「已取消」态）
  const controllers = useRef(new Map<number, AbortController>());
  const cancelled = useRef(new Set<number>());

  const update = useCallback((key: number, patch: Partial<QueueItem>) => {
    itemsRef.current = itemsRef.current.map((it) => (it.key === key ? { ...it, ...patch } : it));
    setItems([...itemsRef.current]);
  }, []);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    for (;;) {
      const next = itemsRef.current.find((it) => it.status === "pending");
      if (!next) break;
      // 上传前才被取消的项：直接落「已取消」，不再发起
      if (cancelled.current.has(next.key)) {
        cancelled.current.delete(next.key);
        update(next.key, { status: "error", error: "已取消" });
        continue;
      }
      update(next.key, { status: "uploading", error: undefined });
      const controller = new AbortController();
      controllers.current.set(next.key, controller);
      try {
        if (next.file.size > SMALL_FILE_LIMIT) {
          await uploadLarge(next.file, next.parentId, (p) => update(next.key, { progress: p }), 1000, {
            signal: controller.signal,
            onUploadId: (uploadId) => update(next.key, { uploadId }),
          });
        } else {
          await uploadSmall(next.file, next.parentId);
        }
        // 上传期间被取消：保持「已取消」，不标完成
        if (!cancelled.current.has(next.key)) {
          update(next.key, { status: "done", progress: 1 });
          void queryClient.invalidateQueries({ queryKey: ["files"] });
          void queryClient.invalidateQueries({ queryKey: ["me"] });
        }
      } catch (e) {
        // 取消触发的失败：保持 cancel 已写入的「已取消」文案
        if (!cancelled.current.has(next.key)) {
          update(next.key, { status: "error", error: e instanceof Error ? e.message : "上传失败" });
        }
      } finally {
        cancelled.current.delete(next.key);
        controllers.current.delete(next.key);
      }
    }
    running.current = false;
  }, [queryClient, update]);

  const add = useCallback(
    (files: File[], parentId: string) => {
      itemsRef.current = [
        ...itemsRef.current,
        ...files.map((file) => ({
          key: ++seq.current, name: file.name, size: file.size,
          parentId, file, status: "pending" as QueueStatus, progress: 0,
        })),
      ];
      setItems([...itemsRef.current]);
      void drain();
    },
    [drain],
  );

  const retry = useCallback(
    (key: number) => {
      cancelled.current.delete(key);
      update(key, { status: "pending" });
      void drain();
    },
    [drain, update],
  );

  // 取消（「暂停」语义，续传需后端支持，备案）：中止在途请求 + abortUpload 清理服务端分片
  const cancel = useCallback(
    (key: number) => {
      const item = itemsRef.current.find((it) => it.key === key);
      if (!item || item.status === "done" || item.status === "error") return;
      cancelled.current.add(key);
      controllers.current.get(key)?.abort();
      if (item.uploadId) void abortUpload(item.uploadId).catch(() => {});
      update(key, { status: "error", error: "已取消" });
    },
    [update],
  );

  const clearFinished = useCallback(() => {
    itemsRef.current = itemsRef.current.filter((it) => it.status === "uploading" || it.status === "pending");
    setItems([...itemsRef.current]);
  }, []);

  return { items, add, retry, cancel, clearFinished };
}
