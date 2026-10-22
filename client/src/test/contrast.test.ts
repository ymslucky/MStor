import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { contrast, extractBlock, parseColor, parseDeclarations, resolveVars } from "./contrast";

// Vitest 对 CSS 导入返回空对象（?raw / glob 亦然），直接按候选路径读源文件：
// 测试通常从仓库根启动（client/src/index.css），从 client 目录启动时则是 src/index.css。
function loadCss(): string {
  for (const p of ["client/src/index.css", "src/index.css"]) {
    try {
      const text = readFileSync(p, "utf8");
      if (text.includes("@theme")) return text;
    } catch {
      // 尝试下一个候选路径
    }
  }
  throw new Error("无法读取 client/src/index.css");
}
const css = loadCss();

/**
 * 设计令牌对比度闸门：把 docs/design-system.md 的 ≥4.5:1 承诺变成 CI 断言。
 * 覆盖默认亮色、暗色、slate / ink / brutal 皮肤；半透明浅底先与其所在表面合成。
 */

const theme = parseDeclarations(extractBlock(css, "@theme"));
const darkRoot = parseDeclarations(extractBlock(extractBlock(css, /@media \(prefers-color-scheme: dark\)/), ":root"));
const slate = parseDeclarations(extractBlock(css, 'html[data-skin="slate"]'));
const ink = parseDeclarations(extractBlock(css, 'html[data-skin="ink"]'));
const brutal = parseDeclarations(extractBlock(css, 'html[data-skin="brutal"]'));

const variants: Record<string, Record<string, string>> = {
  默认亮色: theme,
  暗色: { ...theme, ...darkRoot },
  slate: { ...theme, ...slate },
  ink: { ...theme, ...ink },
  brutal: { ...theme, ...brutal },
};

/** token 名（不带 --）→ 解析后的颜色 */
function color(vars: Record<string, string>, token: string) {
  const raw = vars[`--${token}`];
  if (raw === undefined) throw new Error(`缺少令牌 --${token}`);
  return parseColor(resolveVars(raw, vars));
}

/** 半透明底先叠到某个实色表面上 */
function compositeOver(vars: Record<string, string>, bgToken: string, surfaceToken: string) {
  const bg = color(vars, surfaceToken);
  const blend = color(vars, bgToken);
  const out = {
    r: blend.r * blend.a + bg.r * (1 - blend.a),
    g: blend.g * blend.a + bg.g * (1 - blend.a),
    b: blend.b * blend.a + bg.b * (1 - blend.a),
    a: 1,
  };
  return out;
}

const PAIRS: { name: string; fg: string; bg: string; min?: number }[] = [
  { name: "ink on bg", fg: "color-ink", bg: "color-bg" },
  { name: "ink on surface-1", fg: "color-ink", bg: "color-surface-1" },
  { name: "ink on surface-2", fg: "color-ink", bg: "color-surface-2" },
  { name: "ink on bg-sub", fg: "color-ink", bg: "color-bg-sub" },
  { name: "ink-2 on surface-1", fg: "color-ink-2", bg: "color-surface-1" },
  { name: "ink-2 on bg-sub", fg: "color-ink-2", bg: "color-bg-sub" },
  { name: "ink-3 on surface-1", fg: "color-ink-3", bg: "color-surface-1" },
  { name: "ink-3 on surface-2", fg: "color-ink-3", bg: "color-surface-2" },
  { name: "ink-3 on bg", fg: "color-ink-3", bg: "color-bg" },
  { name: "ink-3 on bg-sub", fg: "color-ink-3", bg: "color-bg-sub" },
  { name: "primary-text on primary-soft", fg: "color-primary-text", bg: "color-primary-soft" },
  { name: "success-text on success-soft", fg: "color-success-text", bg: "color-success-soft" },
  { name: "warn-text on warn-soft", fg: "color-warn-text", bg: "color-warn-soft" },
  { name: "danger-text on danger-soft", fg: "color-danger-text", bg: "color-danger-soft" },
  { name: "chip-amber-fg on chip-amber-bg", fg: "color-chip-amber-fg", bg: "color-chip-amber-bg" },
  { name: "chip-blue-fg on chip-blue-bg", fg: "color-chip-blue-fg", bg: "color-chip-blue-bg" },
  { name: "chip-violet-fg on chip-violet-bg", fg: "color-chip-violet-fg", bg: "color-chip-violet-bg" },
  { name: "chip-rose-fg on chip-rose-bg", fg: "color-chip-rose-fg", bg: "color-chip-rose-bg" },
];

describe("设计令牌对比度（WCAG AA 4.5:1）", () => {
  for (const [variantName, vars] of Object.entries(variants)) {
    test(variantName, () => {
      const failures: string[] = [];
      for (const pair of PAIRS) {
        const fg = color(vars, pair.fg);
        // 浅底可能是半透明（如暗色的 primary-soft）：叠在 surface-1 上计算
        const bg = compositeOver(vars, pair.bg, "color-surface-1");
        const ratio = contrast(fg, bg);
        if (ratio < (pair.min ?? 4.5)) {
          failures.push(`${pair.name} = ${ratio.toFixed(2)}:1（需 ≥${pair.min ?? 4.5}）`);
        }
      }
      expect(failures, failures.join("\n")).toEqual([]);
    });
  }
});
