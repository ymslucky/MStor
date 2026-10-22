import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { listRecent } from "../api/library";
import { searchNodes } from "../api/search";
import type { SearchKind, SearchSort } from "../api/search";
import type { Node } from "../api/types";
import { PALETTE_ACTIONS } from "../lib/palette";
import type { PaletteItem, PaletteSection } from "../lib/palette";
import { queryKeys } from "../lib/queryKeys";
import { useDebounce } from "./useDebounce";

/**
 * 命令面板的数据与交互状态：查询、分组、键盘导航、点外关闭、跳转。
 * UI（SearchBox 输入框 + PaletteResults 下拉）只消费这里返回的状态，便于单测与复用。
 */
export function usePaletteSearch({ onNavigate }: { onNavigate?: () => void } = {}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<SearchSort>("recent");
  const [kind, setKind] = useState<SearchKind>("all");
  const [cursor, setCursor] = useState(0);
  const dq = useDebounce(q, 300);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const kw = dq.trim();

  const search = useInfiniteQuery({
    queryKey: queryKeys.search(dq, sort, kind),
    // 首屏不带 cursor（保持既有调用签名），后续页用服务端返回的 nextCursor
    queryFn: ({ pageParam }) =>
      searchNodes({ q: dq, sort, type: kind, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: kw.length > 0,
  });
  const recent = useQuery({ queryKey: queryKeys.recent, queryFn: listRecent, enabled: open && kw.length === 0 });

  // 多页合并：节点顺序按服务端分页顺序拼接，路径字典合并
  const data = useMemo(() => {
    const pages = search.data?.pages ?? [];
    return pages.reduce<{ nodes: Node[]; paths: Record<string, string> }>(
      (acc, page) => ({ nodes: [...acc.nodes, ...page.nodes], paths: { ...acc.paths, ...page.paths } }),
      { nodes: [], paths: {} },
    );
  }, [search.data]);
  const isFetching = search.isFetching;
  const hasNextPage = Boolean(search.hasNextPage);
  const isFetchingNextPage = search.isFetchingNextPage;
  const loadMore = () => {
    if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // 查询条件一变，高亮回到首项
  useEffect(() => setCursor(0), [dq, kind, sort, open]);

  const close = () => {
    setOpen(false);
    setQ("");
    onNavigate?.();
  };

  const go = (dirId: string | null) => {
    navigate(dirId ? `/?dir=${dirId}` : "/");
    close();
  };

  const nodeItem = (n: Node, idx: number): PaletteItem => ({
    key: `node-${n.id}`,
    idx,
    node: n,
    path: data?.paths[n.id] ?? "",
    run: () => go(n.is_dir ? n.id : n.parent_id || null),
  });

  // 分组：结果为空时只留「最近访问」；有查询词时按类型分组，操作组一并过滤
  const sections: PaletteSection[] = [];
  let idx = 0;
  if (kw.length === 0) {
    const recents = (recent.data?.nodes ?? []).slice(0, 5);
    if (recents.length) sections.push({ key: "recent", title: "最近访问", items: recents.map((n) => nodeItem(n, idx++)) });
  } else {
    const nodes = data?.nodes ?? [];
    const dirs = nodes.filter((n) => n.is_dir === 1);
    const files = nodes.filter((n) => n.is_dir !== 1);
    if (dirs.length) sections.push({ key: "dir", title: "文件夹", items: dirs.map((n) => nodeItem(n, idx++)) });
    if (files.length) sections.push({ key: "file", title: "文件", items: files.map((n) => nodeItem(n, idx++)) });
  }
  const actions = PALETTE_ACTIONS.filter((a) => kw.length === 0 || a.label.toLowerCase().includes(kw.toLowerCase()));
  if (actions.length) {
    sections.push({
      key: "action",
      title: "操作",
      items: actions.map((a) => ({
        key: a.key,
        idx: idx++,
        label: a.label,
        Icon: a.Icon,
        run: () => {
          navigate(a.to);
          close();
        },
      })),
    });
  }
  const flat = sections.flatMap((s) => s.items);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (flat.length === 0) return;
      e.preventDefault();
      setCursor((c) => (e.key === "ArrowDown" ? (c + 1) % flat.length : (c - 1 + flat.length) % flat.length));
    } else if (e.key === "Enter") {
      const item = flat[cursor];
      if (!item) return;
      e.preventDefault();
      item.run();
    } else if (e.key === "Tab") {
      // Tab 切分组：跳到下一分组首项（不离开输入框，保持单输入体验）
      if (flat.length === 0) return;
      e.preventDefault();
      let offset = 0;
      const starts: number[] = [];
      for (const s of sections) {
        starts.push(offset);
        offset += s.items.length;
      }
      setCursor(starts.find((i) => i > cursor) ?? starts[0]);
    } else if (e.key === "Escape") {
      // 只收起下拉；不拦事件，让外层弹窗（Radix）也能收到 Esc
      setOpen(false);
    }
  };

  const resetFilters = () => {
    setQ("");
    setSort("recent");
    setKind("all");
  };

  const setQuery = (value: string) => {
    setQ(value);
    setOpen(true);
  };

  return {
    q,
    setQuery,
    open,
    openPanel: () => setOpen(true),
    sort,
    setSort,
    kind,
    setKind,
    cursor,
    setCursor,
    sections,
    flat,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    loadMore,
    kw,
    boxRef,
    onKeyDown,
    resetFilters,
    go,
  };
}
