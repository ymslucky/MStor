import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { ensureDir } from "../api/nodes";
import { SMALL_FILE_LIMIT, abortUpload, uploadLarge, uploadSmall } from "../api/uploads";
import type { PendingUpload } from "../lib/dirscan";

export type QueueStatus = "pending" | "uploading" | "done" | "error";

export interface QueueItem {
  key: number;
  name: string;
  /** 相对上传根路径（嵌套文件夹上传），如 "photos/2024/a.jpg"；平铺上传省略 */
  path?: string;
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

  // 已建目录缓存：key = `${parentId}/${段}`，同目录多文件只 ensure 一次（Promise 复用）
  const dirCache = useRef(new Map<string, Promise<string>>());
  // 按 path 逐级 ensure 目录，返回文件最终所属目录 id（顺序 await，父子依赖）
  const ensureDirs = useCallback(async (parentId: string, path: string): Promise<string> => {
    const segments = path.split("/").slice(0, -1).filter(Boolean);
    let parent = parentId;
    for (const seg of segments) {
      const key = `${parent}/${seg}`;
      let p = dirCache.current.get(key);
      if (!p) {
        p = ensureDir({ parentId: parent || undefined, name: seg }).then(
          (n) => n.id,
          (e) => {
            dirCache.current.delete(key); // 失败不缓存，重试可重新建
            throw e;
          },
        );
        dirCache.current.set(key, p);
      }
      parent = await p;
    }
    return parent;
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
        // 嵌套上传：先逐级 ensure 中间目录，得到最终父目录
        const parentId = next.path ? await ensureDirs(next.parentId, next.path) : next.parentId;
        if (next.file.size > SMALL_FILE_LIMIT) {
          await uploadLarge(next.file, parentId, (p) => update(next.key, { progress: p }), 1000, {
            signal: controller.signal,
            onUploadId: (uploadId) => update(next.key, { uploadId }),
          });
        } else {
          await uploadSmall(next.file, parentId);
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
  }, [ensureDirs, queryClient, update]);

  const add = useCallback(
    (items: (File | PendingUpload)[], parentId: string) => {
      const normalized = items.map((it) => {
        const [file, path] = it instanceof File ? [it, undefined] : [it.file, it.path];
        return {
          key: ++seq.current, name: file.name, path, size: file.size,
          parentId, file, status: "pending" as QueueStatus, progress: 0,
        };
      });
      itemsRef.current = [...itemsRef.current, ...normalized];
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
