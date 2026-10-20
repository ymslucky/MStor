import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchNodes } from "../api/search";
import type { SearchKind, SearchSort } from "../api/search";
import { useDebounce } from "../hooks/useDebounce";
import { NodeIcon } from "./NodeIcon";

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<SearchSort>("recent");
  const [kind, setKind] = useState<SearchKind>("all");
  const dq = useDebounce(q, 300);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["search", dq, sort, kind],
    queryFn: () => searchNodes({ q: dq, sort, type: kind }),
    enabled: dq.trim().length > 0,
  });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (dirId: string | null) => {
    navigate(dirId ? `/?dir=${dirId}` : "/");
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        aria-label="搜索"
        placeholder="搜索文件名…"
        className="w-40 rounded-xl border border-line bg-white px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:w-56 focus:border-accent focus:outline-none sm:w-56"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && dq.trim() && (
        <div className="glass anim-pop absolute right-0 z-nav mt-1 max-h-80 w-80 max-w-[calc(100vw-2rem)] overflow-auto">
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
            {isFetching && <span className="text-2xs text-ink-3">搜索中…</span>}
          </div>
          {isFetching && <div className="px-3 py-2 text-xs text-ink-dim">搜索中…</div>}
          {data?.nodes.length === 0 && !isFetching && <div className="px-3 py-2 text-xs text-ink-dim">无结果</div>}
          {data?.nodes.map((n) => (
            <button
              key={n.id}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-bg-sub"
              onClick={() => go(n.is_dir ? n.id : n.parent_id || null)}
            >
              <div className="flex items-center gap-1.5 truncate">
                <NodeIcon node={n} size={14} className="shrink-0" />
                <span className="truncate">{n.name}</span>
              </div>
              <div className="truncate text-xs text-ink-faint">{data.paths[n.id] ?? ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
