import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/**
 * OpenDesign anti-patterns 的自动化护栏：
 * 只扫描 UI 实现（排除测试与 /design 演示页），防止「hover 位移/缩放、玻璃模糊、spring」回潮。
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BANNED: { pattern: RegExp; reason: string }[] = [
  { pattern: /hover:-?translate/, reason: "禁止 hover 位移" },
  { pattern: /group-hover:scale/, reason: "禁止 hover 缩放" },
  { pattern: /active:scale/, reason: "禁止 active 缩放" },
  { pattern: /backdrop-blur/, reason: "禁止玻璃模糊" },
  { pattern: /--ease-spring/, reason: "禁止 spring 曲线" },
  { pattern: /bg-gradient-to/, reason: "禁止渐变背景" },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) return walk(full);
    return /.(tsx?|css)$/.test(entry) ? [full] : [];
  });
}

test("UI 实现不包含 OpenDesign 反模式", () => {
  const files = walk(ROOT).filter(
    (f) => !f.includes(".test.") && !f.endsWith("pages/DesignPage.tsx"),
  );
  const violations: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const { pattern, reason } of BANNED) {
      if (pattern.test(text)) violations.push(`${path.relative(ROOT, file)}: ${reason}`);
    }
  }
  expect(violations).toEqual([]);
});
