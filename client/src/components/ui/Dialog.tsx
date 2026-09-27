import { useEffect, useState } from "react";
import type * as React from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** 额外底部操作区（可选） */
  footer?: React.ReactNode;
}

// 统一弹窗外壳：Esc/遮罩关闭，内容区 stopPropagation；
// 桌面（sm+）居中 sm:max-w-md，移动端贴底 bottom sheet（slide-up + safe-bottom）
export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 进场动画：挂载后经两帧 rAF 切换 translate 类，单次 transition 完成 slide-up；卸载动画省略（MVP）
  useEffect(() => {
    if (!open) return;
    setEntered(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      data-testid="dialog-mask"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        data-testid="dialog-panel"
        className={`glass-modal safe-bottom w-full rounded-t-panel p-4 transition-transform duration-320 ease-out-soft sm:max-w-md sm:rounded-panel sm:p-5 ${entered ? "translate-y-0" : "translate-y-full"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-3">{children}</div>
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
