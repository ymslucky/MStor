import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { copyNode, createDir, deleteNode, listFiles, moveNode, renameNode, undoOperation } from "../api/nodes";

export function useFiles(parentId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["files", parentId], queryFn: () => listFiles(parentId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["files"] });

  // 撤销窗口：移动/改名成功后服务端返回 undoId，前端在 Snackbar 里保留 30 秒可用
  const [undoId, setUndoId] = useState<string | null>(null);
  const trackUndo = (res?: { undoId?: string }) => setUndoId(res?.undoId ?? null);

  const mkDir = useMutation({ mutationFn: (name: string) => createDir({ parentId, name }), onSuccess: invalidate });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameNode(id, name),
    onSuccess: (res) => {
      trackUndo(res);
      void invalidate();
    },
  });
  const move = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => moveNode(id, to),
    onSuccess: (res) => {
      trackUndo(res);
      void invalidate();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteNode(id), onSuccess: invalidate });
  const copy = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => copyNode(id, to),
    onSuccess: invalidate,
  });

  const undo = useMutation({
    mutationFn: (id: string) => undoOperation(id),
    onSuccess: () => {
      setUndoId(null);
      void invalidate();
    },
  });

  return { query, mkDir, rename, move, remove, copy, undo, undoId, clearUndo: () => setUndoId(null) };
}
