import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: string;
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

// 受控右键菜单：fixed 定位在指针处，点击他处/Esc/滚动关闭
// 点击菜单项时动作先于 window 级关闭监听执行（React 委托在根容器，先冒泡）
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
      className="fixed z-[60] min-w-[10rem] rounded-xl border border-line bg-white py-1 shadow-card"
      style={{ left: pos.x, top: pos.y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          type="button"
          onClick={item.onClick}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
            item.danger ? "text-danger" : "text-ink"
          }`}
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
