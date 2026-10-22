import type { ReactNode } from "react";
import { Button, Surface } from "./ui";

/**
 * 批量操作浮条：文件页 / 回收站 / 分享页共用同一份定位与容器样式。
 * 只负责「已选 N 项 + 操作按钮槽位 + 取消」，具体动作由调用方注入。
 */
export function SelectionBar({
  count,
  children,
  onClear,
  hidden = false,
}: {
  count: number;
  children: ReactNode;
  onClear: () => void;
  hidden?: boolean;
}) {
  if (count <= 0 || hidden) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-overlay flex justify-center px-4 sm:bottom-6">
      <Surface className="flex items-center gap-1.5 p-2">
        <span className="whitespace-nowrap px-2 text-sm font-medium text-ink">已选 {count} 项</span>
        {children}
        <Button size="sm" variant="ghost" onClick={onClear}>
          取消
        </Button>
      </Surface>
    </div>
  );
}
