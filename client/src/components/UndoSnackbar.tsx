import { useEffect } from "react";
import { Undo2, X } from "lucide-react";
import { UNDO_UI_MS } from "../lib/constants";

/**
 * 撤销条：移动/改名后浮出，10 秒内可撤销（服务端窗口 30 秒，前端提前收起避免用户点了已过期）。
 * 只承担展示与倒计时，是否可用由服务端决定——过期点击会拿到 404，统一走 toast。
 * onClose 必须稳定（useCallback），否则上传进度等无关重渲染会不断重置倒计时。
 */
export function UndoSnackbar({
  message,
  onUndo,
  onClose,
}: {
  message: string;
  onUndo: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onClose, UNDO_UI_MS);
    return () => window.clearTimeout(t);
  }, [onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="undo-snackbar"
      className="glass anim-pop fixed inset-x-4 bottom-24 z-modal mx-auto flex max-w-md items-center gap-3 px-4 py-2.5 md:bottom-8"
    >
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="inline-flex items-center gap-1 rounded-btn px-2 py-1 text-sm font-medium text-primary-text transition-colors hover:bg-primary-soft"
      >
        <Undo2 size={14} aria-hidden />
        撤销
      </button>
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="rounded-full p-1 text-ink-3 transition-colors hover:bg-bg-sub hover:text-ink"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
