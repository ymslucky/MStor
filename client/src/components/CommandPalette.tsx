import { useEffect, useRef, useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import SearchBox from "./SearchBox";

/**
 * 命令面板（v7.13）：独立 Radix Dialog，桌面为居中大面板、移动端为底部抽屉。
 * 不使用通用 Dialog，是为了隐藏重复的标题栏，把整个面板让给「输入 + 筛选 + 结果 + 键盘提示」。
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
        className="glass state-layer flex h-10 items-center gap-2 px-3 text-sm text-ink-2"
      >
        <Search size={16} aria-hidden />
        <span className="hidden lg:inline">搜索</span>
        <kbd className="hidden rounded border border-line px-1 text-2xs text-ink-3 lg:inline">⌘K</kbd>
      </button>

      <RadixDialog.Root open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay
            data-testid="dialog-mask"
            className="anim-fade fixed inset-0 z-overlay bg-ink/40"
          />
          <RadixDialog.Content
            data-testid="dialog-panel"
            className="anim-pop fixed inset-x-0 bottom-0 z-modal mx-auto flex max-h-[86dvh] w-full flex-col overflow-hidden rounded-t-panel border border-line bg-surface-1 shadow-lift outline-none sm:inset-x-auto sm:top-24 sm:bottom-auto sm:left-1/2 sm:max-h-[min(70vh,620px)] sm:max-w-2xl sm:-translate-x-1/2 sm:rounded-panel"
          >
            <RadixDialog.Title className="sr-only">搜索文件</RadixDialog.Title>
            <RadixDialog.Description className="sr-only">
              搜索文件名或文件夹，或跳转到常用位置
            </RadixDialog.Description>
            <SearchBox autoFocus onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </>
  );
}
