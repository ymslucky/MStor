import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addFavorite, listFavorites, removeFavorite } from "../api/library";
import { listShares } from "../api/shares";
import type { Node } from "../api/types";
import { toast } from "../components/Toaster";
import { queryKeys } from "../lib/queryKeys";
import { usePullToRefresh } from "./usePullToRefresh";

type FilesQuery = { refetch: () => Promise<unknown>; data?: { nodes?: Node[] } };

/**
 * 文件页的只读数据面：分享标记、收藏集合、当前目录节点、下拉刷新。
 * 与交互（选择/批量/上传）无关，因此可以独立测试与复用。
 */
export function useBrowserQuery(query: FilesQuery) {
  const sharesQuery = useQuery({ queryKey: queryKeys.shares, queryFn: listShares });
  const favorites = useQuery({ queryKey: queryKeys.favorites, queryFn: listFavorites });

  const allNodes = useMemo(() => query.data?.nodes ?? [], [query.data]);

  const sharedIds = useMemo(
    () => new Set((sharesQuery.data?.shares ?? []).map((s) => s.node_id)),
    [sharesQuery.data],
  );

  const favIds = useMemo(
    () => new Set((favorites.data?.nodes ?? []).map((n) => n.id)),
    [favorites.data],
  );

  const toggleFavorite = (n: Node) => {
    const on = favIds.has(n.id);
    void (on ? removeFavorite(n.id) : addFavorite(n.id))
      .then(() => {
        toast(on ? "已取消收藏" : "已收藏", "info");
        return favorites.refetch();
      })
      .catch((e) => toast(e instanceof Error ? e.message : "操作失败"));
  };

  const pull = usePullToRefresh(() => query.refetch());

  return { allNodes, favIds, pull, sharedIds, toggleFavorite };
}
