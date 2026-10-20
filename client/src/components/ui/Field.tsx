import { useId } from "react";
import type * as React from "react";
import { cn } from "../../lib/cn";

/**
 * 表单行：label + 控件 + hint/error 一体。
 * 错误用 --state-critical-text + 图标 + aria-describedby，不靠颜色单独表意。
 */
export function Field({
  label,
  hint,
  error,
  required,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** 控件（通常是 <Input />），会自动获得 id 与 aria-describedby */
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
}) {
  const autoId = useId();
  const controlId = children.props.id ?? autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={controlId} className="text-2xs font-medium text-ink-2">
        {label}
        {required && <span aria-hidden className="ml-0.5 text-danger-text">*</span>}
      </label>
      {/* 只注入无障碍属性，不改控件自身样式 */}
      {(() => {
        const Control = children.type;
        const props = children.props;
        return <Control {...props} id={controlId} aria-describedby={describedBy} aria-invalid={!!error} />;
      })()}
      {hint && (
        <p id={hintId} className="text-2xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-2xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
