import * as RadixDialog from "@radix-ui/react-dialog";
import type * as React from "react";
import { cn } from "../../lib/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** 额外底部操作区（可选） */
  footer?: React.ReactNode;
  /** 皮肤：white=实色卡（默认，表单/确认）/ glass=玻璃层 */
  skin?: "glass" | "white";
}

/**
 * 统一弹窗外壳（Radix Dialog 驱动）。
 * 焦点陷阱、Esc、遮罩点击、aria（role/aria-modal/aria-labelledby）、滚动锁定、
 * 关闭后焦点还原都交给 Radix；这里只保留视觉与「移动端底部抽屉 / 桌面居中」形态。
 * 对外契约不变：data-testid="dialog-mask"、"dialog-panel"，title/children/footer/skin。
 */
export function Dialog({ open, onClose, title, children, footer, skin = "white" }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          data-testid="dialog-mask"
          className="anim-fade fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]"
        />
        <RadixDialog.Content
          data-testid="dialog-panel"
          className={cn(
            "anim-pop fixed inset-x-0 bottom-0 z-50 mx-auto w-full rounded-t-panel p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] outline-none",
            "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-panel sm:p-4",
            skin === "glass" ? "glass-strong" : "glass",
          )}
        >
          <RadixDialog.Title className="text-lg font-semibold text-ink">{title}</RadixDialog.Title>
          <div className="mt-3">{children}</div>
          {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
