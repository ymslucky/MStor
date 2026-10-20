import { Button } from "./ui";

interface Props {
  count: number;
  hasFileSelected: boolean;
  onDownload: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClear: () => void;
  /** 批量弹窗打开时隐藏，避免遮挡 */
  hidden?: boolean;
}

/** 批量操作条：选中 ≥1 项时浮出（移动端避让底部导航，故 bottom-20） */
export function BatchBar({ count, hasFileSelected, onDownload, onMove, onDelete, onClear, hidden }: Props) {
  if (count <= 0 || hidden) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 sm:bottom-6">
      <div className="glass flex items-center gap-1.5 rounded-card p-2">
        <span className="whitespace-nowrap px-2 text-sm font-medium text-ink">已选 {count} 项</span>
        {hasFileSelected && (
          <Button size="sm" onClick={onDownload}>
            下载
          </Button>
        )}
        <Button size="sm" onClick={onMove}>
          移动
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          删除
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          取消
        </Button>
      </div>
    </div>
  );
}
