import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchNodes } from "../api/search";
import { useDebounce } from "../hooks/useDebounce";

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounce(q, 300);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["search", dq],
    queryFn: () => searchNodes(dq),
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
        className="w-40 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:w-56 focus:border-accent/60 focus:outline-none sm:w-56"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && dq.trim() && (
        <div className="absolute right-0 z-30 mt-1 max-h-80 w-80 max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-white/10 bg-[#131b30] shadow-glass">
          {isFetching && <div className="px-3 py-2 text-xs text-ink-dim">搜索中…</div>}
          {data?.nodes.length === 0 && !isFetching && <div className="px-3 py-2 text-xs text-ink-dim">无结果</div>}
          {data?.nodes.map((n) => (
            <button
              key={n.id}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-white/5"
              onClick={() => go(n.is_dir ? n.id : n.parent_id || null)}
            >
              <div className="truncate">{n.is_dir ? "📁" : "📄"} {n.name}</div>
              <div className="truncate text-xs text-ink-faint">{data.paths[n.id] ?? ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
