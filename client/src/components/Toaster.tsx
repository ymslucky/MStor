import { useSyncExternalStore } from "react";

export interface ToastItem {
  id: number;
  message: string;
  kind: "error" | "info";
}

let toasts: ToastItem[] = [];
let listeners: Array<(t: ToastItem[]) => void> = [];
let seq = 0;

function emit() {
  for (const l of listeners) l(toasts);
}

export function toast(message: string, kind: "error" | "info" = "error") {
  const item = { id: ++seq, message, kind };
  toasts = [...toasts, item];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id);
    emit();
  }, 4000);
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
    <div className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 space-y-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl border px-4 py-2 text-sm text-white shadow-lg ${
            t.kind === "error" ? "border-red-400/30 bg-red-500/90" : "border-white/10 bg-[#1b2440]/95"
          }`}
          role="alert"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
