/**
 * 拖拽上传的全屏提示层：只在拖拽进行中渲染（由 useDropUpload 的计数法驱动，避免子元素闪烁）。
 */
export function DropOverlay({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <div data-testid="drop-overlay" className="fixed inset-0 z-overlay bg-surface-1/90">
      <div className="absolute inset-3 flex items-center justify-center rounded-card border-2 border-dashed border-primary bg-surface-1/70 sm:inset-6">
        <p className="text-sm font-medium text-ink">松开，上传到当前目录</p>
      </div>
    </div>
  );
}
