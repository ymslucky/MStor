import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { copyNode, createDir, deleteNode, listFiles, moveNode, renameNode, undoOperation } from "../api/nodes";
import { queryKeys } from "../lib/queryKeys";

/** 可撤销的操作类型：决定 Snackbar 文案 */
export type UndoKind = "move" | "rename";

/**
 * 当前目录的数据面 + 写操作：查询、创建/改名/移动/删除/复制、撤销。
 * 撤销状态收敛为一个来源 {id, kind}，避免「文案写死已移动」「clearUndo 每次渲染新建导致倒计时重置」。
 */
export function useFiles(parentId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.files(parentId),
    queryFn: () => listFiles(parentId),
    // Browser 自带错误卡片与重试按钮，无需全局再弹 toast
    meta: { silent: true },
  });
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.filesAll }),
    [queryClient],
  );

  // 撤销窗口：移动/改名成功后服务端返回 undoId，前端在 Snackbar 里保留 10 秒可用（服务端 30 秒）
  const [undo, setUndo] = useState<{ id: string; kind: UndoKind } | null>(null);
  const trackUndo = useCallback((kind: UndoKind, res?: { undoId?: string }) => {
    setUndo(res?.undoId ? { id: res.undoId, kind } : null);
  }, []);
  const clearUndo = useCallback(() => setUndo(null), []);

  const mkDir = useMutation({ mutationFn: (name: string) => createDir({ parentId, name }), onSuccess: invalidate });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameNode(id, name),
    onSuccess: (res) => {
      trackUndo("rename", res);
      void invalidate();
    },
  });
  const move = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => moveNode(id, to),
    onSuccess: (res) => {
      trackUndo("move", res);
      void invalidate();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteNode(id), onSuccess: invalidate });
  const copy = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => copyNode(id, to),
    onSuccess: invalidate,
  });

  const undoMutation = useMutation({
    mutationFn: (id: string) => undoOperation(id),
    onSuccess: () => {
      setUndo(null);
      void invalidate();
    },
  });

  return {
    query,
    mkDir,
    rename,
    move,
    remove,
    copy,
    undo: undoMutation,
    undoId: undo?.id ?? null,
    undoKind: undo?.kind ?? "move",
    clearUndo,
  };
}
