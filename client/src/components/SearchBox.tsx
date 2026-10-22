import { useEffect } from "react";
import { Search, X } from "lucide-react";
import { usePaletteSearch } from "../hooks/usePaletteSearch";
import { PaletteResults } from "./search/PaletteResults";

/**
 * 命令面板主体（v7.13）：输入 → 筛选 → 结果列表 → 键盘提示，全部在一个纵向布局里，
 * 不再使用「输入框 + 绝对定位下拉」的嵌套浮层。CommandPalette 负责弹窗外壳。
 */
export default function SearchBox({
  autoFocus,
  onNavigate,
  onClose,
}: {
  autoFocus?: boolean;
  onNavigate?: () => void;
  onClose?: () => void;
} = {}) {
  const palette = usePaletteSearch({ onNavigate });
  const { openPanel, open, q, setQuery } = palette;

  // 打开命令面板即展示「最近访问」，不再依赖输入框是否拿到焦点
  useEffect(() => {
    openPanel();
  }, [openPanel]);

  return (
    <div ref={palette.boxRef} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-4 py-3">
        <Search size={18} aria-hidden className="shrink-0 text-ink-3" />
        <input
          aria-label="搜索"
          placeholder="搜索文件、文件夹或跳转…"
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
          value={q}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={openPanel}
          onKeyDown={palette.onKeyDown}
        />
        {q && (
          <button
            type="button"
            aria-label="清空搜索"
            onClick={() => setQuery("")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-bg-sub hover:text-ink"
          >
            <X size={15} aria-hidden />
          </button>
        )}
        {onClose ? (
          <button
            type="button"
            aria-label="关闭搜索"
            onClick={onClose}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-bg-sub hover:text-ink"
          >
            <X size={16} aria-hidden />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-2xs text-ink-3 sm:inline">Esc</kbd>
        )}
      </div>

      {open && (
        <PaletteResults
          sections={palette.sections}
          flat={palette.flat}
          cursor={palette.cursor}
          setCursor={palette.setCursor}
          kw={palette.kw}
          isFetching={palette.isFetching}
          sort={palette.sort}
          setSort={palette.setSort}
          kind={palette.kind}
          setKind={palette.setKind}
          onResetFilters={palette.resetFilters}
          onGoRoot={() => palette.go(null)}
          hasNextPage={palette.hasNextPage}
          isFetchingNextPage={palette.isFetchingNextPage}
          onLoadMore={palette.loadMore}
        />
      )}

      <div className="flex shrink-0 items-center justify-between border-t border-line px-4 py-2 text-2xs text-ink-3">
        <span>↑↓ 移动 · Enter 打开 · Tab 切换分组</span>
        {onClose && <span>Esc 关闭</span>}
      </div>
    </div>
  );
}
