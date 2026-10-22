import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import SearchBox from "./SearchBox";
import { Dialog } from "./ui";

/**
 * Spotlight 式搜索入口（桌面端替代顶栏搜索框）：
 * ⌘K / Ctrl+K 或点击浮动按钮打开；移动端不使用（搜索在抽屉里）。
 */
export function CommandPalette({ onOpen }: { onOpen?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const openPalette = () => {
    onOpen?.();
    setOpen(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const next = !openRef.current;
        if (next) onOpen?.();
        setOpen(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);

  return (
    <>
      <button
        type="button"
        aria-label="搜索（⌘K）"
        onClick={openPalette}
        className="glass state-layer flex h-10 items-center gap-2 px-3 text-sm text-ink-2 shadow-lift"
      >
        <Search size={16} aria-hidden />
        <span className="hidden lg:inline">搜索</span>
        <kbd className="hidden rounded border border-line px-1 text-2xs text-ink-3 lg:inline">⌘K</kbd>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="搜索文件">
        <SearchBox autoFocus onNavigate={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
