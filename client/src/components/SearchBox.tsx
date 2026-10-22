import { usePaletteSearch } from "../hooks/usePaletteSearch";
import { PaletteResults } from "./search/PaletteResults";

/**
 * 命令面板入口：输入框 + 下拉结果。
 * 数据/键盘/分组在 usePaletteSearch，下拉渲染在 PaletteResults，本组件只做组合。
 * ↑↓ 移动、Enter 打开、Tab 切分组、Esc 关闭（下拉先收；Radix 再收弹窗）。
 */
export default function SearchBox({ autoFocus, onNavigate }: { autoFocus?: boolean; onNavigate?: () => void } = {}) {
  const palette = usePaletteSearch({ onNavigate });

  return (
    <div ref={palette.boxRef} className="relative">
      <input
        aria-label="搜索"
        placeholder="搜索文件名…（↑↓ 移动 · Enter 打开 · Tab 切分组）"
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        value={palette.q}
        onChange={(e) => palette.setQuery(e.target.value)}
        onFocus={palette.openPanel}
        onKeyDown={palette.onKeyDown}
      />
      {palette.open && (
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
    </div>
  );
}
