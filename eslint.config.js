import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "client/dist/**",
      ".wrangler/**",
      "coverage/**",
      "dist/**",
      ".tmp-verify/**",
      ".tmp-build/**",
      ".tmp-preview/**",
      ".npm-cache/**",
      ".agents/**",
      ".codex/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.worker, ...globals.es2022 },
    },
    rules: {
      // 未使用变量：允许下划线前缀占位（catch/参数签名等）
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "no-console": ["error", { allow: ["error", "warn"] }],
      // 原语强制：卡片外观只能来自 ui/Surface，胶囊只能来自 ui/Pill / Badge
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute > Literal[value=/rounded-card border border-line/]",
          message: "手写卡片外观：请使用 components/ui 的 <Surface>",
        },
        {
          selector: "JSXAttribute > Literal[value=/rounded-full bg-[a-z-]*soft px-/]",
          message: "手写胶囊：请使用 components/ui 的 <Pill> 或 <Badge>",
        },
        {
          selector: "JSXAttribute > Literal[value=/text-\\[\\d+px\\]/]",
          message: "任意字号：请使用 type 刻度（text-2xs/xs/sm/base/lg/xl/2xl）",
        },
      ],
    },
  },
  {
    files: ["client/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["*.config.{js,ts}", "vitest.*.config.ts", "eslint.config.js", "scripts/**/*.mjs", "scripts/**/*.cjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // 校验脚本是 CommonJS（需要 require 编译产物），ESM 规则不适用
    files: ["scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
