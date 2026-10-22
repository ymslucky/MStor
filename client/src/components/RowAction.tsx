import type * as React from "react";

export type RowActionTone = "neutral" | "blue" | "violet" | "amber" | "danger";

const TONES: Record<RowActionTone, string> = {
  neutral: "text-ink-2 hover:bg-bg-sub hover:text-ink",
  blue: "text-primary-text hover:bg-primary-soft",
  violet: "text-chip-violet-fg hover:bg-chip-violet-bg",
  amber: "text-warn-text hover:bg-warn-soft",
  danger: "text-danger-text hover:bg-danger-soft",
};

/**
 * 紧凑行内图标按钮（28px）：列表操作列专用。
 * 从 FileList 抽出——行内操作组（NodeRowActions）与回收站都依赖它，
 * 展示型列表组件不应再兼任「按钮工厂」。
 * 颜色只用语义令牌（禁止 bg-blue-50 这类调色板直写）。
 */
export function RowAction({
  label,
  tone = "neutral",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: RowActionTone }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${TONES[tone]} ${className}`}
      {...rest}
    />
  );
}
