import type { ConflictPolicy } from "../lib/conflict";
import { Button, Dialog } from "./ui";

// 策略与自动改名规则在 lib/conflict（hook 不再反向依赖组件）；这里保持导出以兼容既有引用
export type { ConflictPolicy } from "../lib/conflict";
export { uniqueName } from "../lib/conflict";

/**
 * 同名冲突决策：默认记住上次选择（localStorage mstor_upload_conflict）。
 * 保留两者 = 自动改名；覆盖 = 先彻底删除同名节点再上传；跳过 = 不入队。
 * 外壳复用 ui/Dialog（Radix：焦点陷阱 / Esc / 遮罩 / 焦点还原），不再手写 role=dialog。
 */
export function ConflictDialog({
  names,
  remember,
  onRememberChange,
  onDecide,
  onCancel,
}: {
  names: string[];
  remember: boolean;
  onRememberChange: (v: boolean) => void;
  onDecide: (policy: ConflictPolicy) => void;
  onCancel: () => void;
}) {
  const preview = names.slice(0, 5);
  return (
    <Dialog
      open
      onClose={onCancel}
      title={`有 ${names.length} 个同名文件`}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDecide("skip")}>
            跳过同名
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDecide("overwrite")}>
            覆盖
          </Button>
          <Button size="sm" onClick={() => onDecide("keepBoth")}>
            保留两者
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">当前目录已存在以下名称，选择处理方式：</p>
      <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-xs text-ink-2">
        {preview.map((n) => (
          <li key={n} className="truncate">
            · {n}
          </li>
        ))}
        {names.length > preview.length && <li className="text-ink-3">…等共 {names.length} 个</li>}
      </ul>
      <label className="mt-3 flex items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" checked={remember} onChange={(e) => onRememberChange(e.target.checked)} />
        记住我的选择
      </label>
    </Dialog>
  );
}
