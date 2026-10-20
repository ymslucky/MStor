import { Button } from "./ui";

export type ConflictPolicy = "keepBoth" | "overwrite" | "skip";

/**
 * 同名冲突决策：默认记住上次选择（localStorage mstor_upload_conflict）。
 * 保留两者 = 自动改名；覆盖 = 先彻底删除同名节点再上传；跳过 = 不入队。
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
      data-testid="conflict-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div className="glass anim-pop w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
        <h2 id="conflict-title" className="text-lg font-semibold text-ink">
          有 {names.length} 个同名文件
        </h2>
        <p className="mt-1 text-sm text-ink-2">当前目录已存在以下名称，选择处理方式：</p>
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
        <div className="mt-4 flex flex-wrap justify-end gap-2">
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
        </div>
      </div>
    </div>
  );
}

/** 自动改名：name (1).ext，避免与现有名称和本批已占用名称冲突 */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; i < 1000; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}
