import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { SMALL_FILE_LIMIT, uploadLarge, uploadSmall } from "../api/uploads";

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
}

export function useUploadQueue() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef<QueueItem[]>([]);
  const seq = useRef(0);
  const running = useRef(false);

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
      update(next.key, { status: "uploading", error: undefined });
      try {
        if (next.file.size > SMALL_FILE_LIMIT) {
          await uploadLarge(next.file, next.parentId, (p) => update(next.key, { progress: p }));
        } else {
          await uploadSmall(next.file, next.parentId);
        }
        update(next.key, { status: "done", progress: 1 });
        void queryClient.invalidateQueries({ queryKey: ["files"] });
        void queryClient.invalidateQueries({ queryKey: ["me"] });
      } catch (e) {
        update(next.key, { status: "error", error: e instanceof Error ? e.message : "上传失败" });
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
      update(key, { status: "pending" });
      void drain();
    },
    [drain, update],
  );

  const clearFinished = useCallback(() => {
    itemsRef.current = itemsRef.current.filter((it) => it.status === "uploading" || it.status === "pending");
    setItems([...itemsRef.current]);
  }, []);

  return { items, add, retry, clearFinished };
}
