import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface ContextMenuItem {
  label: string;
  /** Lucide 图标节点 */
  icon?: ReactNode;
  danger?: boolean;
  onClick: () => void;
}

interface Props {
  open: boolean;
  /** 打开位置（指针坐标），越界时自动翻转 */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * 受控右键菜单：fixed 定位在指针处，越界翻转；点击他处 / Esc / 滚动关闭。
 *
 * 键盘可达性（不依赖 Radix 也满足菜单语义）：
 * ↑↓/Home/End 移动焦点，Enter/Space 触发（原生按钮行为），Esc 关闭并把焦点还给触发元素，
 * 打开时焦点落在第一个条目；鼠标按住时焦点跟随 hover。
 */
export default function ContextMenu({ open, x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // 越界翻转：测量后若溢出视口则向内收
  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const nx = x + width > window.innerWidth ? Math.max(4, window.innerWidth - width - 4) : x;
    const ny = y + height > window.innerHeight ? Math.max(4, window.innerHeight - height - 4) : y;
    setPos({ x: nx, y: ny });
  }, [open, x, y, items]);

  // 打开时把焦点放到第一个条目，关闭时还给打开前的元素
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    return () => prev?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (!el) return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      if (!nodes.length) return;
      const idx = nodes.indexOf(document.activeElement as HTMLElement);
      let next = -1;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") next = idx < 0 ? 0 : (idx + 1) % nodes.length;
      else if (e.key === "ArrowUp") next = idx <= 0 ? nodes.length - 1 : idx - 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = nodes.length - 1;
      if (next >= 0) {
        e.preventDefault();
        nodes[next].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    // 点击他处关闭（菜单项的 onClick 在根容器阶段已执行）
    window.addEventListener("click", onClose);
    // 捕获阶段监听滚动，覆盖任意内层滚动容器
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [open, onClose]);

  if (!open || !items.length) return null;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="节点操作"
      className="glass anim-pop fixed z-menu min-w-[10rem] py-1"
      style={{ left: pos.x, top: pos.y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          type="button"
          onClick={item.onClick}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-primary-soft/60 focus-visible:bg-primary-soft/60",
            item.danger ? "text-danger-text" : "text-ink",
          )}
        >
          {item.icon && (
            <span aria-hidden className="w-4 text-center">
              {item.icon}
            </span>
          )}
          {item.label}
        </button>
      ))}
    </div>
  );
}
