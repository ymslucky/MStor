/** 标签可选色板（服务端校验 #hex；默认第一个） */
export const TAG_COLORS = [
  { value: "#4f46e5", label: "靛蓝" },
  { value: "#0f766e", label: "青" },
  { value: "#b45309", label: "琥珀" },
  { value: "#be123c", label: "玫红" },
  { value: "#7c3aed", label: "紫" },
  { value: "#475467", label: "石墨" },
] as const;

export const DEFAULT_TAG_COLOR = TAG_COLORS[0].value;

/** 展示用色点：无颜色时退回中性灰 */
export function tagDotColor(color?: string | null): string {
  return color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#667085";
}
