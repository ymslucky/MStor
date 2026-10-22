/**
 * 设计令牌对比度工具（测试专用）：
 * 从 index.css 文本里提取 @theme / 暗色 / 皮肤块的令牌，解析 var() 链与半透明色，
 * 计算 WCAG 对比度。用来把「文档声称 ≥4.5:1」变成可回归的断言。
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** 找到 selector 第一次出现后紧邻的 { ... } 内容（支持嵌套花括号） */
export function extractBlock(css: string, selector: string | RegExp): string {
  const index = typeof selector === "string" ? css.indexOf(selector) : (selector.exec(css)?.index ?? -1);
  if (index < 0) return "";
  const open = css.indexOf("{", index);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return "";
}

/** 提取块内所有 --token: value; 声明 */
export function parseDeclarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out[`--${m[1]}`] = m[2].trim();
  return out;
}

/** 递归解析 var(--x) / var(--x, fallback) */
export function resolveVars(value: string, vars: Record<string, string>, depth = 0): string {
  if (depth > 12 || !value.includes("var(")) return value;
  return value.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]*))?\)/g, (_all, name: string, fallback?: string) => {
    const next = vars[name];
    if (next === undefined) return fallback ?? "";
    return resolveVars(next, vars, depth + 1);
  });
}

/** 解析 #rgb/#rrggbb/#rrggbbaa 与 rgb()/rgba()（含现代斜杠写法） */
export function parseColor(raw: string): Rgba {
  const value = raw.trim();
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    const expand = (s: string) => parseInt(s.length === 1 ? s + s : s, 16);
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: expand(hex[0]),
        g: expand(hex[1]),
        b: expand(hex[2]),
        a: hex.length === 4 ? expand(hex[3]) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(value);
  if (m) {
    const alpha = m[4]?.endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4] ?? 1);
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
  }
  throw new Error(`无法解析颜色：${raw}`);
}

/** 半透明 fg 叠在 bg 上的实际颜色 */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a,
  };
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(c: Rgba): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG 对比度：前景先与背景合成，再按相对亮度计算 */
export function contrast(fg: Rgba, bg: Rgba): number {
  const f = luminance(composite(fg, bg));
  const b = luminance(bg);
  const [light, dark] = f > b ? [f, b] : [b, f];
  return (light + 0.05) / (dark + 0.05);
}
