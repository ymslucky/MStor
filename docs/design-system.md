# MStor 设计系统 v4

> 代码真相：`client/src/index.css` 的 `@theme` 块（令牌）+ `client/src/components/ui/*`（原语）。
> 本文只解释"为什么这样定"和"什么时候用哪一档"，令牌值以 CSS 为准。

## 1. 问题：v3 哪里不对

| 症状 | 根因 |
|---|---|
| 整体偏"糖果感" | 主色 #7c9eff + 奶橘 #ffb380 两团彩色光晕 + 大量粉彩芯片同时出现 |
| 层次靠模糊 | 玻璃三档（`.glass/.glass-strong/.glass-light`）用在侧栏、卡片、弹窗、Toast 上，内容与容器的边界靠 blur 表达，视觉噪音大、滚动掉帧 |
| 令牌两代并存 | `ink-2/ink-dim`、`primary/accent`、`warn/warning` 同时存在，组件各用一套，配色改动无法一处生效 |
| 尺度不一 | 圆角 16px 用在按钮/输入/卡片/弹窗全部位置；没有字号阶梯；千分位数字不对齐 |

## 2. 原则（四条，冲突时按顺序取舍）

1. **中性优先**：90% 的界面由"表面 + 文字 + 发丝线"构成；彩色只用于**一个**强调色和**功能状态**。
2. **层次用实色，不用模糊**：0 页面 / 1 卡片 / 2 悬浮 三档表面 + 1px 发丝边框 + 极浅投影；玻璃只剩模态遮罩可接受。
3. **一个强调色**：靛蓝 `--color-primary` 承担链接、主按钮、选中态、焦点环；同一屏不出现第二个彩色装饰。
4. **克制**：动效 ≤240ms 且只做 6–8px 位移；圆角按档位使用；不做渐变按钮、不做彩色阴影。

## 3. 令牌

### 3.1 表面与文字

| 令牌 | 用途 |
|---|---|
| `--color-bg` / `--color-surface-0` | 页面底色 |
| `--color-surface-1` | 卡片、输入框、侧栏按钮底（默认"可点"面） |
| `--color-surface-2` | 悬浮层：弹窗、下拉、顶栏、Toast |
| `--color-bg-sub` | 次级区块、hover 底、空态底 |
| `--color-ink` | 主文字（标题、正文） |
| `--color-ink-2` | 次要文字（说明、列头、元信息） |
| `--color-ink-3` | 弱文字（占位符、时间戳） |
| `--color-line` | 发丝边框（1px，禁止更粗） |
| `--color-line-strong` | hover/选中边框 |

对比度：`ink`/`ink-2` 在 surface-1 上均 ≥ 4.5:1；`ink-3` 仅用于非关键信息。

### 3.2 功能色（只表达状态）

`--color-primary(-text/-soft)` 强调 ｜ `--color-success(-text)` 成功 ｜ `--color-warn(-text)` 警告 ｜ `--color-danger(-text)` 危险。

规则：底色用浅档（`primary-soft` / `chip-*-bg`），文字用深档（`-text`）；**不要**用功能色做大面积背景。

### 3.3 圆角 / 阴影 / 字号 / 动效

| 档位 | 值 | 用途 |
|---|---|---|
| `rounded-chip` | 6px | 标签、徽章、焦点环 |
| `rounded-btn` / `rounded-input` | 8px | 按钮、输入、图标按钮 |
| `rounded-card` | 12px | 卡片、列表容器、骨架 |
| `rounded-panel` | 14px | 弹窗、抽屉 |
| `shadow-card` | 1–2 层极浅 | 卡片默认 |
| `shadow-lift` | 稍大 | 下拉、弹窗、hover 抬升 |
| `text-2xs/xs/sm/base/lg/xl/2xl` | 11/12/13/15/18/22/28px | 正文默认 `text-sm`(13) 或 `text-base`(15) |
| `duration-fast` / `duration-slow` | 120/240ms | 颜色与位移过渡 |
| `ease-out-soft` | — | 所有位移/进场 |

数字（大小、时间、计数）一律加 `.num`（tabular-nums），避免列表抖动。

## 4. 组件契约

| 原语 | 用在哪 | 禁止 |
|---|---|---|
| `Button` variant=primary/ghost/danger, size=md/sm | 主操作、次操作、破坏性操作 | 一个视图里出现两个 primary 并排 |
| `IconButton` | 工具栏、行内操作 | 没有 aria-label |
| `Input` | 表单输入 | 自行覆盖 border/rounded（用 className 只做宽度） |
| `Badge` tone=default/accent/success/danger | 状态、角色、计数 | 作为按钮 |
| `GlassCard`（实为 surface-1 卡片） | 内容分组 | 卡片里再套卡片超过两层 |
| `Skeleton` | 首屏加载 | 用于局部刷新 |
| `Dialog` | 模态 | 页面内联内容 |

