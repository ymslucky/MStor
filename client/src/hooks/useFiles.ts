import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDir, deleteNode, listFiles, moveNode, renameNode } from "../api/nodes";

export function useFiles(parentId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["files", parentId], queryFn: () => listFiles(parentId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["files"] });

  const mkDir = useMutation({ mutationFn: (name: string) => createDir({ parentId, name }), onSuccess: invalidate });
  const rename = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => renameNode(id, name), onSuccess: invalidate });
  const move = useMutation({ mutationFn: ({ id, to }: { id: string; to: string }) => moveNode(id, to), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => deleteNode(id), onSuccess: invalidate });

  return { query, mkDir, rename, move, remove };
}
