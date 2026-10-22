import { useSyncExternalStore } from "react";
import * as Toast from "@radix-ui/react-toast";
import { Info, TriangleAlert, X } from "lucide-react";
import { cn } from "../lib/cn";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  kind: "error" | "info";
  /** 可选动作按钮（如 PWA「发现新版本」的刷新） */
  action?: ToastAction;
}

const DURATION = 4000;
let toasts: ToastItem[] = [];
let listeners: Array<(t: ToastItem[]) => void> = [];
let seq = 0;

function emit() {
  for (const l of listeners) l(toasts);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/**
 * 命令式 toast：前两个参数签名不变（既有 35+ 处调用点零改动），第三参可选动作按钮。
 * 队列与自动关闭由 Radix Toast 负责。
 */
export function toast(message: string, kind: "error" | "info" = "error", action?: ToastAction) {
  toasts = [...toasts, { id: ++seq, message, kind, action }];
  emit();
}

export function Toaster() {
  const items = useSyncExternalStore(
    (cb) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    },
    () => toasts,
  );

  return (
    <Toast.Provider swipeDirection="right" duration={DURATION}>
      {items.map((t) => (
        <Toast.Root
          key={t.id}
          open
          duration={DURATION}
          type={t.kind === "error" ? "foreground" : "background"}
          onOpenChange={(open) => {
            if (!open) dismiss(t.id);
          }}
          className={cn(
            "glass anim-item-in flex items-center gap-2 px-4 py-2 text-sm",
            "data-[state=closed]:anim-fade",
            t.kind === "error" ? "text-danger-text" : "text-ink",
          )}
        >
          {t.kind === "error" ? (
            <TriangleAlert size={16} aria-hidden className="shrink-0" />
          ) : (
            <Info size={16} aria-hidden className="shrink-0 text-primary-text" />
          )}
          <Toast.Description className="min-w-0 flex-1">{t.message}</Toast.Description>
          {t.action && (
            <Toast.Action altText={t.action.label} asChild>
              <button
                type="button"
                className="shrink-0 rounded-btn px-2 py-1 text-xs font-medium text-primary-text transition-colors hover:bg-primary-soft"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            </Toast.Action>
          )}
          <Toast.Close
            aria-label="关闭提示"
            className="rounded-full p-0.5 text-ink-3 transition-colors hover:bg-bg-sub hover:text-ink"
          >
            <X size={14} aria-hidden />
          </Toast.Close>
        </Toast.Root>
      ))}
      {/* 顶栏高 56px：toast 从 64px 起，避免遮挡 AppHeader 的菜单/搜索/通知 */}
      <Toast.Viewport className="fixed top-16 left-1/2 z-menu flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 outline-none" />
    </Toast.Provider>
  );
}
