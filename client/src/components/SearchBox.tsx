import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, FilePlus2, FolderOpen, RotateCcw, Trash2, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { searchNodes } from "../api/search";
import type { SearchKind, SearchSort } from "../api/search";
import { listRecent } from "../api/library";
import type { Node } from "../api/types";
import { useDebounce } from "../hooks/useDebounce";
import { queryKeys } from "../lib/queryKeys";
import { NodeIcon } from "./NodeIcon";
import { Button } from "./ui";

/** 静态操作组：命令面板不只是搜文件，也要能直接跳转常用去处 */
const ACTIONS: { key: string; label: string; to: string; Icon: LucideIcon }[] = [
  { key: "act-new", label: "新建文件夹", to: "/", Icon: FilePlus2 },
  { key: "act-recent", label: "转到最近访问", to: "/recent", Icon: Clock },
  { key: "act-fav", label: "转到收藏", to: "/favorites", Icon: Star },
  { key: "act-trash", label: "转到回收站", to: "/trash", Icon: Trash2 },
];

/** 命中片段高亮：只包一层 mark，不改变外层文本（测试按全文匹配元素） */
function Highlight({ text, query }: { text: string; query: string }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-primary-soft px-0.5 text-primary-text">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

interface PaletteItem {
  key: string;
  idx: number;
  node?: Node;
  path?: string;
  label?: string;
  Icon?: LucideIcon;
  run: () => void;
}

/**
 * 命令面板主体：单一输入 + 分组结果（文件夹/文件/操作）+ 键盘全流程。
 * 空查询显示「最近访问」（/api/library/recent），无结果给可操作建议。
 * ↑↓ 移动、Enter 打开、Tab 切分组、Esc 关闭（下拉先收；Radix 再收弹窗）。
 */
export default function SearchBox({ autoFocus, onNavigate }: { autoFocus?: boolean; onNavigate?: () => void } = {}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<SearchSort>("recent");
  const [kind, setKind] = useState<SearchKind>("all");
  const [cursor, setCursor] = useState(0);
  const dq = useDebounce(q, 300);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const kw = dq.trim();

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.search(dq, sort, kind),
    queryFn: () => searchNodes({ q: dq, sort, type: kind }),
    enabled: kw.length > 0,
  });
  const recent = useQuery({ queryKey: queryKeys.recent, queryFn: listRecent, enabled: open && kw.length === 0 });

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
  const sections: { key: string; title: string; items: PaletteItem[] }[] = [];
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
  const actions = ACTIONS.filter((a) => kw.length === 0 || a.label.toLowerCase().includes(kw.toLowerCase()));
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

  return (
    <div ref={boxRef} className="relative">
      <input
        aria-label="搜索"
        placeholder="搜索文件名…（↑↓ 移动 · Enter 打开 · Tab 切分组）"
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="glass anim-pop absolute inset-x-0 z-nav mt-1 max-h-80 overflow-auto">
          <div className="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
            <select
              aria-label="排序"
              value={sort}
              onChange={(e) => setSort(e.target.value as SearchSort)}
              className="rounded-btn border border-line bg-surface-1 px-1.5 py-0.5 text-2xs text-ink"
            >
              <option value="recent">最近</option>
              <option value="name">名称</option>
              <option value="size">大小</option>
            </select>
            <select
              aria-label="类型"
              value={kind}
              onChange={(e) => setKind(e.target.value as SearchKind)}
              className="rounded-btn border border-line bg-surface-1 px-1.5 py-0.5 text-2xs text-ink"
            >
              <option value="all">全部</option>
              <option value="file">文件</option>
              <option value="dir">文件夹</option>
            </select>
            <span className="ml-auto text-2xs text-ink-3">{isFetching ? "搜索中…" : `${flat.length} 项`}</span>
          </div>

          {flat.length === 0 && !isFetching ? (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-ink-2">{kw ? `没有匹配「${kw}」的结果` : "输入关键字开始搜索"}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="ghost" onClick={resetFilters}>
                  <RotateCcw size={12} aria-hidden />
                  清除筛选
                </Button>
                <Button size="sm" variant="ghost" onClick={() => go(null)}>
                  <FolderOpen size={12} aria-hidden />
                  新建文件夹
                </Button>
              </div>
            </div>
          ) : (
            sections.map((s) => (
              <div key={s.key}>
                <p className="px-3 pt-2 pb-1 text-2xs font-medium text-ink-3">{s.title}</p>
                {s.items.map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    data-active={cursor === it.idx ? "true" : undefined}
                    onMouseEnter={() => setCursor(it.idx)}
                    onClick={it.run}
                    className={`block w-full px-3 py-2 text-left text-sm ${
                      cursor === it.idx ? "bg-primary-soft" : "hover:bg-bg-sub"
                    }`}
                  >
                    {it.node ? (
                      <>
                        <div className="flex items-center gap-1.5 truncate">
                          <NodeIcon node={it.node} size={14} className="shrink-0" />
                          <span className="truncate">
                            <Highlight text={it.node.name} query={kw} />
                          </span>
                        </div>
                        <div className="truncate text-xs text-ink-faint">
                          <Highlight text={it.path ?? ""} query={kw} />
                        </div>
                      </>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {it.Icon && <it.Icon size={14} aria-hidden className="shrink-0 text-ink-3" />}
                        {it.label}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
