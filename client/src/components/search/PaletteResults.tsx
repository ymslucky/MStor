import { FolderOpen, RotateCcw } from "lucide-react";
import type { SearchKind, SearchSort } from "../../api/search";
import { NodeIcon } from "../NodeIcon";
import { Button } from "../ui";
import { Highlight } from "./Highlight";
import type { PaletteItem, PaletteSection } from "../../lib/palette";

/**
 * 命令面板下拉内容：排序/类型筛选头 + 分组结果 + 空态 CTA。
 * 输入、键盘与数据都在 usePaletteSearch；本组件只负责把结果画出来。
 */
export function PaletteResults({
  sections,
  flat,
  cursor,
  setCursor,
  kw,
  isFetching,
  sort,
  setSort,
  kind,
  setKind,
  onResetFilters,
  onGoRoot,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
}: {
  sections: PaletteSection[];
  flat: PaletteItem[];
  cursor: number;
  setCursor: (idx: number) => void;
  kw: string;
  isFetching: boolean;
  sort: SearchSort;
  setSort: (v: SearchSort) => void;
  kind: SearchKind;
  setKind: (v: SearchKind) => void;
  onResetFilters: () => void;
  onGoRoot: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}) {
  return (
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
            <Button size="sm" variant="ghost" onClick={onResetFilters}>
              <RotateCcw size={12} aria-hidden />
              清除筛选
            </Button>
            <Button size="sm" variant="ghost" onClick={onGoRoot}>
              <FolderOpen size={12} aria-hidden />
              回到根目录
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
                className={`block w-full px-3 py-2 text-left text-sm ${cursor === it.idx ? "bg-primary-soft" : "hover:bg-bg-sub"}`}
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

      {flat.length > 0 && hasNextPage && (
        <div className="border-t border-line px-2 py-1.5 text-center">
          <Button size="sm" variant="ghost" disabled={isFetchingNextPage} onClick={onLoadMore}>
            {isFetchingNextPage ? "加载中…" : "加载更多结果"}
          </Button>
        </div>
      )}
    </div>
  );
}
