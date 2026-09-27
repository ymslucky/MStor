# MStor UI 重构实施计划（玻璃拟态设计系统 + PWA 移动端）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变任何功能与 API 的前提下，将 MStor 前端重构为玻璃拟态（Glassmorphism）设计语言，建立 token 驱动的设计系统，并全面适配 PWA 移动端（响应式、触控、离线）。

**Architecture:** 三层结构——①`client/src/index.css` 的 Tailwind v4 `@theme` 设计 token（色彩/玻璃层级/圆角/阴影/动效）+ 全局玻璃工具类；②`client/src/components/ui/` 原子组件库（Button/Input/GlassCard/Dialog/EmptyState 等，全部走 token）；③页面层只组合组件不写裸样式。PWA 层强化 SW 缓存策略与离线回退。

**Tech Stack:** React 19 + TailwindCSS v4（CSS-first `@theme`）+ vite-plugin-pwa（已就绪）。

---

## 设计上下文与决策（执行者必读）

- **产品**：MStor 家庭私有云盘，中文界面，移动端为一级场景（PWA 添加到主屏）。
- **视觉方向**：暗色玻璃拟态——深色极光渐变背景（`#0b1020 → #1b2447 → 青色微光`），磨砂玻璃面板浮于其上；accent 为青蓝（sky-cyan）渐变。**单主题（暗色）**，token 按语义命名，预留未来浅色主题扩展。
- **性能护栏（硬性）**：
  - `backdrop-filter: blur` 只允许出现在 `.glass-*` 工具类中，且**同屏可见的模糊层 ≤ 4 个**（顶栏/底部导航/当前打开的弹层/浮动的 UploadPanel），列表行、页面主体一律不用模糊。
  - 所有玻璃工具类必须带 `@supports not (backdrop-filter: …)` 回退为不透明底色。
  - 全站尊重 `prefers-reduced-motion`（动画时长归零）与 `prefers-reduced-transparency`（玻璃→不透明）。
- **可访问性（硬性）**：正文对比度 ≥ 4.5:1（玻璃上的文字必须位于 scrim 或高不透明度面板上）；触控目标 ≥ 44×44px；键盘焦点环必须可见（focus-visible 样式进 token）。
- **安全**：不改任何认证/授权逻辑与 API 调用；`mstor_act_as`、cookie 等机制不动；上传面板、配额等敏感信息不透过半透明层直接可读（面板不透明度 ≥ 0.75）。
- **验证基线**：每个任务完成后 `npm run test:client` 全绿 + `npm run check` 零错误；涉及构建的任务 `npm run build` 成功。既有 46 个 client 测试**只允许因组件结构重构而更新选择器，不允许删除断言语义**。

## 玻璃层级规范（全站统一，任何组件不得自创 blur 值）

| 层级 | 类名 | 用途 | 配方 |
|---|---|---|---|
| G1 | `.glass-subtle` | 页内嵌套块（统计条、行 hover） | `bg-white/5` + `blur(8px)` |
| G2 | `.glass-panel` | 顶栏、底部导航、UploadPanel | `bg-slate-900/70` + `blur(16px)` + 底部 1px 高光边 |
| G3 | `.glass-modal` | Dialog / PreviewModal 遮罩上的面板 | `bg-slate-900/80` + `blur(24px)` + 阴影 + 顶部高光 |

---

### Task 1: 设计 token 与玻璃工具类（设计系统地基）

**Files:**
- Modify: `client/src/index.css`（整体重写）
- Test: 无新测试（纯样式），验收 = 构建 + 既有测试全绿

- [ ] **Step 1: 重写 `client/src/index.css`**

```css
@import "tailwindcss";

@theme {
  /* —— 语义色板（暗色单主题，预留浅色扩展）—— */
  --color-ink: #e8edf7;          /* 主文字 */
  --color-ink-dim: #9aa7bd;      /* 次级文字 */
  --color-ink-faint: #5c6a85;    /* 弱化文字/边框 */
  --color-surface: #0d1322;      /* 最底层页面底色 */
  --color-surface-raised: #131b30;
  --color-accent: #38bdf8;       /* sky-400 */
  --color-accent-strong: #0ea5e9;
  --color-accent-deep: #0369a1;
  --color-danger: #f87171;
  --color-success: #34d399;
  --color-warning: #fbbf24;

  /* —— 圆角 / 阴影 —— */
  --radius-card: 1rem;
  --radius-panel: 1.25rem;
  --shadow-glass: 0 8px 32px rgb(0 0 0 / 0.35);
  --shadow-lift: 0 4px 16px rgb(2 6 23 / 0.4);

  /* —— 动效 token —— */
  --ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1);
  --duration-fast: 150ms;
  --duration-slow: 320ms;

  /* —— Tailwind 原生覆盖 —— */
  --color-slate-50: #f1f5f9;
}

/* 页面背景：深色极光渐变（固定 attachment，移动端省电不随滚动重绘） */
body {
  background:
    radial-gradient(1200px 600px at 85% -10%, rgb(56 189 248 / 0.14), transparent 60%),
    radial-gradient(900px 500px at -10% 30%, rgb(99 102 241 / 0.16), transparent 55%),
    radial-gradient(700px 700px at 60% 110%, rgb(14 165 233 / 0.10), transparent 60%),
    var(--color-surface);
  color: var(--color-ink);
  background-attachment: fixed;
  min-height: 100dvh;
}

/* —— 玻璃层级（全站唯三的 backdrop-filter 出口，见计划头部规范）—— */
.glass-subtle, .glass-panel, .glass-modal {
  background-color: rgb(255 255 255 / 0.05);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.glass-panel {
  background-color: rgb(15 23 42 / 0.72);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border-bottom: 1px solid rgb(255 255 255 / 0.08);
}
.glass-modal {
  background-color: rgb(15 23 42 / 0.82);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  border: 1px solid rgb(255 255 255 / 0.10);
  border-top-color: rgb(255 255 255 / 0.16);
  box-shadow: var(--shadow-glass);
}

/* 回退：不支持 backdrop-filter 时用不透明底，保证文字可读 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass-subtle { background-color: #17203a; }
  .glass-panel  { background-color: #101a30; border-bottom-color: rgb(255 255 255 / 0.08); }
  .glass-modal  { background-color: #121c33; }
}

/* 降级：用户偏好低透明度 → 全部玻璃变实底 */
@media (prefers-reduced-transparency: reduce) {
  .glass-subtle { background-color: #17203a; backdrop-filter: none; -webkit-backdrop-filter: none; }
  .glass-panel  { background-color: #101a30; backdrop-filter: none; -webkit-backdrop-filter: none; }
  .glass-modal  { background-color: #121c33; backdrop-filter: none; -webkit-backdrop-filter: none; }
}

/* 降级：减少动效 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* 移动端安全区 */
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
.pb-nav { padding-bottom: calc(env(safe-area-inset-bottom) + 5rem); } /* 底部导航存在时页面留白 */

/* 焦点环（可访问性，全站统一） */
:where(button, a, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: 4px;
}

/* 触控目标下限 */
@media (pointer: coarse) {
  .tap { min-height: 44px; min-width: 44px; }
}
```

- [ ] **Step 2: 验证**

```powershell
npm run test:client; npm run check; npm run build
```

预期全绿（此时页面视觉可能局部未适配暗色——后续任务逐页替换；本任务验收只要求 token/工具类就位且不破坏构建）。

- [ ] **Step 3: 提交**

```powershell
git add client/src/index.css; git commit -m "feat(ui): glassmorphism design tokens and glass utilities"
```

---

### Task 2: 原子组件库 `components/ui/`

**Files:**
- Create: `client/src/components/ui/Button.tsx`、`IconButton.tsx`、`Input.tsx`、`GlassCard.tsx`、`EmptyState.tsx`、`Skeleton.tsx`、`Badge.tsx`、`index.ts`（统一导出）
- Test: `client/src/components/ui/ui.test.tsx`

**组件 API（页面重构的契约，逐字实现）：**

```tsx
// Button.tsx —— variant: primary | ghost | danger; size: md | sm; 全部触控目标 ≥44px(coarse)
export function Button({ variant = "primary", size = "md", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; size?: "md" | "sm" }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none tap";
  const sizes = { md: "px-4 py-2.5 text-sm", sm: "px-2.5 py-1.5 text-xs" };
  const variants = {
    primary: "bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-lift hover:brightness-110",
    ghost: "bg-white/5 text-ink hover:bg-white/10 border border-white/10",
    danger: "bg-red-500/15 text-danger border border-red-400/30 hover:bg-red-500/25",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest} />;
}

// IconButton.tsx —— 图标按钮，44px 触控，aria-label 必填
export function IconButton({ label, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-ink hover:bg-white/10 border border-white/10 transition-colors ${className}`} {...rest} />;
}

// Input.tsx
export function Input({ className = "", ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent/60 focus:bg-white/10 ${className}`} {...rest} />;
}

// GlassCard.tsx —— 内容卡片（不含 blur，属于页面主体）
export function GlassCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-card border border-white/10 bg-white/[0.04] shadow-lift ${className}`}>{children}</div>;
}

// EmptyState.tsx —— icon(emoji) + 标题 + 描述 + 可选操作
export function EmptyState({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="py-16 text-center">
      <div className="text-4xl" aria-hidden>{icon}</div>
      <h3 className="mt-3 font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 text-sm text-ink-dim">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

// Skeleton.tsx —— 加载占位
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/10 ${className}`} aria-hidden />;
}

// Badge.tsx
export function Badge({ tone = "default", children }: { tone?: "default" | "accent" | "danger" | "success"; children: React.ReactNode }) {
  const tones = { default: "bg-white/10 text-ink-dim", accent: "bg-sky-400/15 text-accent", danger: "bg-red-400/15 text-danger", success: "bg-emerald-400/15 text-success" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}
```

`index.ts`：`export * from "./Button"; export * from "./IconButton"; …` 全部导出。

- [ ] **Step 1: 写失败的测试** `ui.test.tsx`：Button 渲染 variant 类名与 disabled 行为；IconButton 断言 aria-label 必达；EmptyState 渲染 icon/title/description/action；Badge 渲染 tone 类名。用 `renderWithProviders`（无需路由也兼容）。
- [ ] **Step 2: 跑测试确认失败** → **Step 3: 按上面代码实现** → **Step 4: 全绿 + check** → **Step 5: 提交** `git commit -m "feat(ui): glass design-system primitives"`

---

### Task 3: 统一 Dialog 外壳（桌面居中 / 移动 bottom sheet）

**Files:**
- Create: `client/src/components/ui/Dialog.tsx`
- Modify: `client/src/components/NameDialog.tsx`、`MoveDialog.tsx`、`ShareDialog.tsx`（改用 Dialog 外壳，业务逻辑/测试断言不变）
- Test: `client/src/components/ui/Dialog.test.tsx` + 既有对话框测试保持全绿

**Dialog 契约：**

```tsx
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** 额外底部操作区（可选） */
  footer?: React.ReactNode;
}
// 行为：Esc 关闭；遮罩点击关闭；内容区 stopPropagation
// 样式：遮罩 fixed inset-0 z-40 bg-black/60；面板 .glass-modal
//   桌面（sm+）：居中 max-w-md w-full rounded-panel
//   移动（<sm）：fixed bottom-0 left-0 right-0 rounded-t-panel，slide-up 动画（translate-y → 0，duration-320 ease-out-soft），safe-bottom
```

- 实现要点：用 CSS 类切换 `sm:sm:items-center sm:justify-center` 与移动端贴底；进出场动画用单次 transition（挂载后 rAF 切换类）即可，卸载动画可省（MVP）。
- 迁移三个既有对话框：外壳换 Dialog，标题/输入/按钮进 children，**保持 aria-label 与按钮文案逐字不变**（既有测试依赖）。
- Step：测试红 → 实现 → 迁移 → 全绿 + check → `git commit -m "feat(ui): unified dialog shell with mobile bottom sheet"`

---

### Task 4: AppShell 重构（玻璃顶栏 + 移动底部导航）

**Files:**
- Modify: `client/src/shell/AppShell.tsx`（重构）
- Test: `client/src/shell/AppShell.test.tsx`（更新断言）

**规格：**
- 顶栏：`.glass-panel sticky top-0 z-30`；内容：品牌「MStor」（accent 渐变文字 `bg-gradient-to-r from-sky-300 to-cyan-200 bg-clip-text text-transparent`）→ 桌面横向 NavLink（激活态 `bg-white/10 text-ink`）→ SearchBox → 用户区（配额条重绘：细轨道 `bg-white/10`，>90% 用 warning 色）+ 退出按钮（IconButton 形态）。
- **移动端 <md**：导航从顶栏移除，改为**底部 Tab 导航** `.glass-panel fixed bottom-0 inset-x-0 z-30 safe-bottom`，四项（文件/回收站/分享/设置），各含 emoji 图标 + 文字，激活态文字 accent + 顶部 2px 指示条；触控区 ≥44px；主内容 `pb-nav` 预留空间。
- act-as 横幅：`.glass-subtle` 贴顶栏下方，warning 色文字。
- Toaster：位置移至**顶部居中**（移动端底部被导航占用），`z-[60]`。
- 测试更新：导航断言从 header 链接改为 `role="navigation"` 内的链接（桌面/移动同一 DOM，用 responsive 类切换显示，测试不受断点影响）；其余断言语义不变。
- Step：测试先改红 → 实现 → 全绿 + check → `git commit -m "feat(ui): glass app shell with mobile bottom tab bar"`

---

### Task 5: Browser 页重构（列表双形态 + 状态完备）

**Files:**
- Modify: `client/src/components/FileList.tsx`（重构）、`client/src/pages/Browser.tsx`（工具栏 + 状态）
- Test: `client/src/pages/Browser.test.tsx`（更新选择器，断言语义不变）

**规格：**
- 工具栏：GlassCard 内横排——面包屑（`text-ink-dim`，当前级 `text-ink`）+ 右侧「上传」「新建文件夹」Button（图标 + 文字，移动端只显图标 + label 由 aria 提供）。
- 列表双形态（同一 DOM，responsive 切换）：
  - **桌面 sm+**：表格行，行 hover `.glass-subtle`；列：名称（图标+名）、大小、修改时间、操作。
  - **移动 <sm**：行变卡片式（`flex justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3`），名称截断两行内，操作折叠为 IconButton（⋯ 展开菜单可后置——MVP 直接横排两个图标按钮：重命名/删除，其余操作进分享等文字链）。
  - **行内操作全部换成 IconButton（aria-label 保留既有命名，如「重命名 {name}」）**——既有测试的 `getByRole("button", { name: /重命名/ })` 语义不变。
- 状态完备：加载中渲染 Skeleton 列表（5 行）；`query.isError` 渲染 EmptyState（icon ⚠️，title 加载失败，action 重试按钮调用 `query.refetch`）；空目录 EmptyState（📁 该目录为空 / 回收站为空等沿用既有文案）。
- PreviewModal 打开时保留 `key={preview.id}`。
- Step：测试改红 → 实现 → 全绿 + check → `git commit -m "feat(ui): glass file browser with dual-form list and full states"`

---

### Task 6: PreviewModal / UploadPanel 玻璃化与移动适配

**Files:**
- Modify: `client/src/components/PreviewModal.tsx`、`client/src/components/UploadPanel.tsx`
- Test: 既有测试全绿（断言不变）

**规格：**
- PreviewModal：面板 `.glass-modal`；头部信息条 scrim（`bg-black/50`）保证白字对比度；移动端媒体区 padding 减半、视频 `w-full`；下载/关闭按钮用 IconButton。
- UploadPanel：`.glass-panel rounded-panel`（浮动卡片，右下 `bottom-20 sm:bottom-4` 避开移动端底部导航）；进度条轨道 `bg-white/10`、填充 accent 渐变；错误行 danger 色。
- Step：全绿 + check → `git commit -m "feat(ui): glass preview modal and upload panel"`

---

### Task 7: 其余页面统一重构（Trash / Shares / Settings / SharePage）

**Files:**
- Modify: `client/src/pages/TrashPage.tsx`、`SharesPage.tsx`、`SettingsPage.tsx`、`SharePage.tsx`
- Test: 各页测试全绿（选择器可更新，语义不变）

**统一规则：**
- 页面标题：`text-lg font-semibold text-ink`；页级容器 GlassCard 包裹表格/表单。
- Trash：说明文案 `text-ink-faint`；操作列 IconButton 化（恢复/彻底删除保留确认语义）。
- Shares：分享链接行 hover `.glass-subtle`；「打开」链接 accent 色。
- Settings：区块卡片化（GlassCard + 内部小节标题）；admin 表格移动端隐藏次要列；「进入空间」按钮改 Button ghost sm。
- SharePage（公开页）：同样玻璃化；提取码门卡片居中 `.glass-modal` 静态展示；保持 aria-label/文案断言兼容。
- Step：全绿 + check → `git commit -m "feat(ui): unify remaining pages with glass design system"`

---

### Task 8: PWA 强化（离线回退 + 缓存策略 + manifest 审查）

**Files:**
- Modify: `vite.config.ts`（VitePWA workbox 配置）、`client/src/main.tsx`（离线指示）、`client/public/offline.html`
- Test: `npm run build` + 抽查 dist

**规格：**
- workbox 增加 `runtimeCaching`：`urlPattern: ({url}) => url.origin === location.origin && url.pathname.startsWith("/assets/")`，`handler: "CacheFirst"`（带哈希的静态资源）；导航请求走 precache 的 navigateFallback（已有）。
- `offlineFallback`：`workbox: { navigateFallbackDenylist: [/^\/api\//, /^\/dav\//, /^\/auth\//] }` 保持；SW 注册 `registerSW({ immediate: true })` 已有。
- 离线指示器：`main.tsx` 里监听 `navigator.onLine` / `online`/`offline` 事件，挂一个固定顶部条「当前离线，显示的是缓存界面」——实现在 `client/src/components/OfflineBar.tsx`（仅离线时渲染）。
- manifest：`lang: "zh-CN"`、`theme_color: "#0d1322"`、`background_color: "#0d1322"`（与 Task 1 surface 对齐）。
- 验收：build 产物含 `offline` 能力不报错；`npm run test:client` 全绿。
- `git commit -m "feat(pwa): offline indicator, runtime caching and manifest audit"`

---

### Task 9: 终局 polish（无障碍 / 性能 / 全量回归）

- [ ] 无障碍核查（代码层面）：玻璃面板上所有正文位于不透明度 ≥0.72 的面板或带 scrim；focus-visible 全站生效（Task 1 已全局）；交互目标 ≥44px（coarse 指针）。
- [ ] 性能核查：全仓 grep `backdrop-filter` 仅允许出现在 index.css（≤3 处类定义）与（如有必要的）Dynamic island 类组件；`npm run build` 产物 gzip 体积记录在案。
- [ ] 全量回归：`npm run test:client; npm run test:server; npm run check; npm run build` 四绿。
- [ ] 浏览器冒烟：桌面 + 移动视口（DevTools 375px）各过一遍五页核心流程。
- [ ] `git commit -m "polish(ui): accessibility and performance pass"`（如有代码改动）

---

## 计划自审记录

- **Spec 覆盖**：用户三点要求 → 玻璃拟态（Task 1/2/4-7）、设计系统（Task 1/2/3 token+原子组件+Dialog 外壳，页面只允许组合）、PWA 移动端（Task 4 底部导航/safe-area、Task 5 双形态列表、Task 8 离线/manifest）；「UX/性能/安全平衡」固化为硬性护栏（模糊预算、对比度、降级媒体查询、触控目标）。
- **风险**：既有测试选择器依赖 emoji 文本节点与 aria-label——Task 4/5 明确要求保留 aria-label 命名与文案；FileList 双形态用同一 DOM 的 responsive 类，避免两套 DOM 导致测试分叉。
- **执行顺序**：1→2→3 为地基必须先行；4-7 依赖 2/3；8/9 收尾。
