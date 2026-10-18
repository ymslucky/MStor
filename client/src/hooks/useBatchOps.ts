import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { batchDeleteNodes, batchMoveNodes, deleteNodePermanently } from "../api/nodes";
import { toast } from "../components/Toaster";

interface Options {
  /** 当前选中节点 id 快照（批量操作开始时读取） */
  selectedIds: ReadonlySet<string>;
  /** 批量成功后清空选择 */
  onClear: () => void;
  /** 单项彻底删除成功后回调（关闭确认弹窗） */
  onPurged: () => void;
}

/**
 * 批量操作（删除/移动/彻底删除）封装：
 * - 分块并行（每块 100 id，2 路并发）降低 HTTP 往返；
 * - 进度条按已处理条目推进；
 * - 统一失效 files/trash/me 查询缓存。
 */
export function useBatchOps({ selectedIds, onClear, onPurged }: Options) {
  const queryClient = useQueryClient();
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchMoving, setBatchMoving] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  const invalidateAll = (permanent = false) => {
    void queryClient.invalidateQueries({ queryKey: ["files"] });
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
    if (permanent) void queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  // 批量请求分块并行：每块 100 个 id（服务端集合式处理，单请求毫秒级），2 路并发；进度按已处理条目推进
  const runChunkedParallel = async (ids: string[], worker: (chunk: string[]) => Promise<number>) => {
    const CHUNK = 100;
    const CONCURRENCY = 2;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    let done = 0;
    let failed = 0;
    let idx = 0;
    setBatchProgress({ done: 0, total: ids.length });
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
        for (;;) {
          const i = idx++;
          if (i >= chunks.length) break;
          try {
            done += await worker(chunks[i]);
          } catch {
            failed += chunks[i].length; // 整块请求失败（网络/4xx）计入失败
          }
          setBatchProgress({ done: Math.min(done + failed, ids.length), total: ids.length });
        }
      }),
    );
    return { done, failed };
  };

  // 批量删除：服务端 batch-delete 一次处理一块（无逐项 HTTP 往返），分块并行加速
  const runBatchDelete = async (permanent = false) => {
    setBatchBusy(true);
    const ids = [...selectedIds];
    const { done, failed } = await runChunkedParallel(ids, async (chunk) => {
      const r = await batchDeleteNodes(chunk, permanent);
      return r.deleted;
    });
    onClear();
    setBatchBusy(false);
    setBatchDeleting(false);
    setBatchProgress(null);
    if (failed > 0) toast(`部分项处理失败（${failed} 项），请重试`, "error");
    else toast(permanent ? `已彻底删除 ${done} 项` : `已移入回收站 ${done} 项`, "info");
    invalidateAll(permanent);
  };

  // 批量移动：服务端 batch-move 一次处理一块，分块并行
  const runBatchMove = async (to: string) => {
    setBatchBusy(true);
    const ids = [...selectedIds];
    const { done, failed } = await runChunkedParallel(ids, async (chunk) => {
      const r = await batchMoveNodes(chunk, to);
      return r.moved;
    });
    onClear();
    setBatchBusy(false);
    setBatchMoving(false);
    setBatchProgress(null);
    if (failed > 0) toast(`部分项移动失败（${failed} 项），请重试`, "error");
    else toast(`已移动 ${done} 项`, "info");
    invalidateAll();
  };

  // 单项彻底删除：弹窗保持打开（busy），成功后回调关闭
  const purgeNow = async (id: string) => {
    setDeleteBusy(true);
    try {
      await deleteNodePermanently(id);
      onPurged();
      toast("已彻底删除", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "彻底删除失败", "error");
    } finally {
      setDeleteBusy(false);
    }
    invalidateAll(true);
  };

  return {
    batchDeleting,
    setBatchDeleting,
    batchMoving,
    setBatchMoving,
    batchBusy,
    deleteBusy,
    batchProgress,
    runBatchDelete,
    runBatchMove,
    purgeNow,
  };
}