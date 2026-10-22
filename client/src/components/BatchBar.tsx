import { SelectionBar } from "./SelectionBar";
import { Button } from "./ui";

interface Props {
  count: number;
  hasFileSelected: boolean;
  onDownload: () => void;
  onMove: () => void;
  onTag: () => void;
  onDelete: () => void;
  onClear: () => void;
  /** 批量弹窗打开时隐藏，避免遮挡 */
  hidden?: boolean;
}

/** 文件页批量操作条：定位/容器/取消按钮由 SelectionBar 统一，这里只保留文件页自己的动作 */
export function BatchBar({ count, hasFileSelected, onDownload, onMove, onTag, onDelete, onClear, hidden }: Props) {
  return (
    <SelectionBar count={count} hidden={hidden} onClear={onClear}>
      {hasFileSelected && (
        <Button size="sm" onClick={onDownload}>
          下载
        </Button>
      )}
      <Button size="sm" onClick={onMove}>
        移动
      </Button>
      <Button size="sm" variant="ghost" onClick={onTag}>
        标签
      </Button>
      <Button size="sm" variant="danger" onClick={onDelete}>
        删除
      </Button>
    </SelectionBar>
  );
}
