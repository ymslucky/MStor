import { FolderOpen, RotateCcw } from "lucide-react";
import type { SearchKind, SearchSort } from "../../api/search";
import { NodeIcon } from "../NodeIcon";
import { Button } from "../ui";
import { Highlight } from "./Highlight";
import type { PaletteItem, PaletteSection } from "../../lib/palette";

const SORT_OPTIONS: { value: SearchSort; label: string }[] = [
  { value: "recent", label: "最近" },
  { value: "name", label: "名称" },
  { value: "size", label: "大小" },
];
const KIND_OPTIONS: { value: SearchKind; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "file", label: "文件" },
  { value: "dir", label: "文件夹" },
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-0.5 rounded-btn border border-line bg-bg-sub p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-[5px] px-2 py-1 text-2xs transition-colors ${
            value === o.value ? "bg-surface-1 font-medium text-ink shadow-soft" : "text-ink-3 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 命令面板结果区（v7.13）：筛选条固定在顶部，结果列表占满剩余高度并独立滚动，
 * 底部加载更多；不再作为绝对定位下拉浮在输入框下方。
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <Segmented label="排序" value={sort} options={SORT_OPTIONS} onChange={setSort} />
        <Segmented label="类型" value={kind} options={KIND_OPTIONS} onChange={setKind} />
        <span className="num ml-auto text-2xs text-ink-3">{isFetching ? "搜索中…" : `${flat.length} 项`}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {flat.length === 0 && !isFetching ? (
          <div className="px-3 py-10 text-center">
            <p className="text-sm text-ink-2">{kw ? `没有匹配「${kw}」的结果` : "输入关键字开始搜索"}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
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
              <p className="px-2 pt-3 pb-1 text-2xs font-medium tracking-wide text-ink-3 uppercase">{s.title}</p>
              {s.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  data-active={cursor === it.idx ? "true" : undefined}
                  onMouseEnter={() => setCursor(it.idx)}
                  onClick={it.run}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                    cursor === it.idx ? "bg-primary-soft text-primary-text" : "text-ink hover:bg-bg-sub"
                  }`}
                >
                  {it.node ? (
                    <>
                      <NodeIcon node={it.node} size={18} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate">
                          <Highlight text={it.node.name} query={kw} />
                        </span>
                        <div className="truncate text-xs text-ink-3">
                          <Highlight text={it.path ?? ""} query={kw} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {it.Icon && <it.Icon size={16} aria-hidden className="shrink-0 text-ink-3" />}
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          ))
        )}

        {flat.length > 0 && hasNextPage && (
          <div className="flex justify-center px-2 py-2">
            <Button size="sm" variant="ghost" disabled={isFetchingNextPage} onClick={onLoadMore}>
              {isFetchingNextPage ? "加载中…" : "加载更多结果"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
