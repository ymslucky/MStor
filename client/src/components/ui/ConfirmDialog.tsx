import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 可选第二动作（如「彻底删除」），置于 footer 左侧 */
  extraAction?: { label: string; onClick: () => void };
}

// 通用确认弹窗：基于 Dialog 外壳（Esc/遮罩关闭）；danger 时确认按钮为 danger 变体
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  extraAction,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          {extraAction && (
            <Button variant="ghost" className="mr-auto! text-danger-text!" disabled={busy} onClick={extraAction.onClick}>
              {extraAction.label}
            </Button>
          )}
          <Button variant="ghost" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={danger ? "danger" : "primary"} disabled={busy} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    >
      {description && <p className="text-sm text-ink-dim">{description}</p>}
    </Dialog>
  );
}
