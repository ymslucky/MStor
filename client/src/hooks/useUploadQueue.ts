import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { ensureDir } from "../api/nodes";
import { SMALL_FILE_LIMIT, abortUpload, instantUpload, sha256Hex, uploadLarge, uploadSmall } from "../api/uploads";
import type { Part } from "../api/uploads";
import type { PendingUpload } from "../lib/dirscan";
import { clearResume, fingerprint, loadResume, saveResume } from "../lib/resume";
import { getUploadConcurrency } from "../lib/settings";
import { SpeedTracker } from "../lib/speed";

export type QueueStatus = "pending" | "uploading" | "paused" | "done" | "error";

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
  /** 估计上传速度（bytes/s），uploading 态有效 */
  speed?: number;
  error?: string;
  /** 大文件 init 后记录，「彻底取消」时调用 abortUpload 清理服务端分片 */
  uploadId?: string;
  /** 大文件指纹：暂停/失败后据此续传 */
  fingerprint?: string;
}

export function useUploadQueue() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef<QueueItem[]>([]);
  const seq = useRef(0);
  const running = useRef(false);
  // 取消/暂停：在途分片请求 AbortController + 已取消标记（结果落地时保持「已取消」态）
  const controllers = useRef(new Map<number, AbortController>());
  const cancelled = useRef(new Set<number>());
  // 大文件续传累计：key → {uploadId, partSize, parts, done}，暂停/失败时写入 localStorage
  const partAcc = useRef(new Map<number, { uploadId: string; partSize: number; parts: Part[]; done: number }>());
  // 速度采样器 + 进度节流时间戳（key → …），完成/失败/重试时清理
  const speeds = useRef(new Map<number, SpeedTracker>());
  const lastEmit = useRef(new Map<number, number>());

  const update = useCallback((key: number, patch: Partial<QueueItem>) => {
    itemsRef.current = itemsRef.current.map((it) => (it.key === key ? { ...it, ...patch } : it));
    setItems([...itemsRef.current]);
  }, []);

  // 速度采样收尾：完成/失败/取消后丢弃采样器，重试从零起算
  const resetSampling = useCallback((key: number) => {
    speeds.current.delete(key);
    lastEmit.current.delete(key);
  }, []);

  // 进度回调（大小文件共用）：100ms 节流（收尾必发）+ EMA 速度
  const onProgress = useCallback(
    (key: number, ratio: number) => {
      const item = itemsRef.current.find((it) => it.key === key);
      if (!item) return;
      const now = Date.now();
      if (ratio < 1 && now - (lastEmit.current.get(key) ?? 0) < 100) return;
      lastEmit.current.set(key, now);
      const tracker = speeds.current.get(key) ?? new SpeedTracker();
      speeds.current.set(key, tracker);
      update(key, { progress: ratio, speed: tracker.push(ratio * item.size, now) });
    },
    [update],
  );

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

  // 暂停/失败时保存续传记录（仅大文件且有累计）
  const stashResume = useCallback((key: number) => {
    const item = itemsRef.current.find((it) => it.key === key);
    const acc = partAcc.current.get(key);
    if (!item?.fingerprint || !acc || !acc.partSize) return; // partSize 未知（init 前中断）则无可续传信息
    saveResume(item.fingerprint, acc);
  }, []);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    // 并发 worker：N 个协程竞争取 pending 项（N = 设置的上传并发数，1-16）
    const worker = async () => {
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
          const isLarge = next.file.size > SMALL_FILE_LIMIT;
          // 大文件才维护续传记录（fingerprint）；有续传记录说明此前已查过秒传未命中，跳过避免重复 hash
          const resume = isLarge && next.fingerprint ? loadResume(next.fingerprint) : null;
          // 秒传（先查后传）：流式算 SHA-256（大文件安全）后查询，命中直接建 node 零文件体传输
          const sha = resume ? null : await sha256Hex(next.file).catch(() => null);
          if (sha && (await instantUpload(next.file, parentId, sha))) {
            onProgress(next.key, 1);
          } else if (isLarge) {
            const fp = next.fingerprint ?? fingerprint(next.file, next.parentId);
            if (!next.fingerprint) update(next.key, { fingerprint: fp });
            const acc = { uploadId: resume?.uploadId ?? "", partSize: 0, parts: [] as Part[], done: 0 };
            if (resume) {
              acc.uploadId = resume.uploadId;
              acc.partSize = resume.partSize;
              acc.parts = [...resume.parts];
              acc.done = resume.done;
            }
            partAcc.current.set(next.key, acc);
            await uploadLarge(next.file, parentId, (p) => onProgress(next.key, p), 1000, {
              signal: controller.signal,
              onUploadId: (uploadId) => {
                update(next.key, { uploadId });
                if (!acc.uploadId) acc.uploadId = uploadId;
              },
              onPartDone: (part, partSize) => {
                acc.partSize = partSize;
                acc.parts.push(part);
                acc.done += Math.min(part.partNumber * partSize, next.size) - (part.partNumber - 1) * partSize;
              },
              concurrency: getUploadConcurrency(),
              resume: resume ? { uploadId: resume.uploadId, partSize: resume.partSize, parts: resume.parts } : undefined,
              sha256: sha ?? undefined, // complete 时写入 nodes.sha256，后续同文件可秒传
            });
          } else {
            await uploadSmall(next.file, parentId, {
              signal: controller.signal,
              onProgress: (r) => onProgress(next.key, r),
              sha256: sha ?? undefined,
            });
          }
          // 上传期间被取消/暂停：不标完成
          if (!cancelled.current.has(next.key)) {
            if (next.fingerprint) clearResume(next.fingerprint);
            partAcc.current.delete(next.key);
            update(next.key, { status: "done", progress: 1, speed: undefined });
            resetSampling(next.key);
            void queryClient.invalidateQueries({ queryKey: ["files"] });
            void queryClient.invalidateQueries({ queryKey: ["me"] });
          }
        } catch (e) {
          // 取消/暂停触发的失败：保持 cancel 已写入的状态
          if (!cancelled.current.has(next.key)) {
            stashResume(next.key); // 失败（非取消）同样保留续传记录，retry 自动续传
            update(next.key, { status: "error", error: e instanceof Error ? e.message : "上传失败", speed: undefined });
          }
          resetSampling(next.key);
        } finally {
          cancelled.current.delete(next.key);
          controllers.current.delete(next.key);
        }
      }
    };
    await Promise.all(Array.from({ length: getUploadConcurrency() }, worker));
    running.current = false;
  }, [ensureDirs, onProgress, queryClient, resetSampling, stashResume, update]);

  const add = useCallback(
    (items: (File | PendingUpload)[], parentId: string) => {
      const normalized = items.map((it) => {
        const [file, path] = it instanceof File ? [it, undefined] : [it.file, it.path];
        return {
          key: ++seq.current, name: file.name, path, size: file.size,
          parentId, file, status: "pending" as QueueStatus, progress: 0,
          // 大文件才计算指纹（续传只对 multipart 有意义）
          fingerprint: file.size > SMALL_FILE_LIMIT ? fingerprint(file, parentId) : undefined,
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
      resetSampling(key);
      update(key, { status: "pending", progress: 0, speed: undefined });
      void drain();
    },
    [drain, resetSampling, update],
  );

  // 暂停（大文件）：中止在途请求但保留服务端分片与续传记录，retry 自动续传
  const cancel = useCallback(
    (key: number) => {
      const item = itemsRef.current.find((it) => it.key === key);
      if (!item || item.status === "done" || item.status === "error" || item.status === "paused") return;
      cancelled.current.add(key);
      controllers.current.get(key)?.abort();
      if (item.uploadId) {
        stashResume(key);
        update(key, { status: "paused", error: undefined, speed: undefined });
      } else {
        update(key, { status: "error", error: "已取消", speed: undefined });
      }
      resetSampling(key);
    },
    [resetSampling, stashResume, update],
  );

  // 彻底取消：清理服务端分片与本地续传记录，并从队列移除
  const purge = useCallback(
    (key: number) => {
      const item = itemsRef.current.find((it) => it.key === key);
      if (!item) return;
      cancelled.current.add(key);
      controllers.current.get(key)?.abort();
      if (item.uploadId) void Promise.resolve(abortUpload(item.uploadId)).catch(() => {});
      if (item.fingerprint) clearResume(item.fingerprint);
      partAcc.current.delete(key);
      resetSampling(key);
      itemsRef.current = itemsRef.current.filter((it) => it.key !== key);
      setItems([...itemsRef.current]);
    },
    [resetSampling],
  );

  const clearFinished = useCallback(() => {
    const removed = itemsRef.current.filter((it) => it.status !== "uploading" && it.status !== "pending" && it.status !== "paused");
    for (const it of removed) resetSampling(it.key);
    itemsRef.current = itemsRef.current.filter((it) => it.status === "uploading" || it.status === "pending" || it.status === "paused");
    setItems([...itemsRef.current]);
  }, [resetSampling]);

  return { items, add, retry, cancel, purge, clearFinished };
}
