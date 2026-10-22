# MStor 前端系统性分析 · 重构与 UX 优化报告

> 范围：`client/src`（约 9,400 行、153 个非测试源文件）+ `docs/design-system.md`。
> 目标：在**不改变功能行为**的前提下，修复真实缺陷、收敛组件边界与参数设计、改善布局/响应式/可访问性。
> 结论均带代码证据；实施按 5 个可回滚的步骤推进，每步通过 `tsc + eslint + 全量客户端测试 + vite build`。

## 1. 项目结构与技术栈

| 层 | 选型 |
| --- | --- |
| 运行时 / 存储 | Cloudflare Workers + R2（对象）+ D1（元数据） |
| 后端 | Hono + TypeScript strict，`server/{routes,middleware,lib,data}` |
| 前端 | React 19、TanStack Query 5（服务端状态）、TanStack Table 8 + Virtual 3（列模型/虚拟滚动）、react-router 7、Tailwind 4、Radix（Dialog/Toast/Slot）、Vite + PWA |
| 设计系统 | `client/src/index.css` 的 `@theme` 令牌 + `components/ui/*` 原语 + `/design` 可视化验收页 |
| 测试 | Vitest：客户端 jsdom（Testing Library + vitest-axe），服务端 `@cloudflare/vitest-pool-workers` |

前端分层基本健康：`pages` 作容器、`hooks` 承载规则、`api` 封装请求、`lib` 放纯函数/常量、`shell` 放布局。问题集中在三处：

1. **少数超载组件**（FileList 453 行/18 props、Browser 405 行/12 hooks、AppShell 202 行同时管布局/会话/抽屉）。
2. **重复实现**（导航 2 套、上传浮层 2 套、胶囊 2 套、行内按钮反向依赖、模态外壳 3 套、批量条 3 套）。
3. **设计令牌与业务常量漂移**（调色板直写、硬编码白色、`mstor_upload_conflict` 绕过 STORAGE_KEYS、阈值散落）。

## 2. 组件角度分析

### 2.1 划分粒度与职责边界

| 组件 | 规模 | 现状职责（问题） | 结论 |
| --- | --- | --- | --- |
| `components/FileList.tsx` | 453 行 / 18 props | 行布局 + 名称过滤 + 排序 + 列偏好持久化 + 拖拽 + 长按多选 + 虚拟化 + 行内按钮工厂 | **超载**：展示组件不应写 localStorage / 自建 matchMedia |
| `pages/Browser.tsx` | 405 行 / 12 hooks | 路由参数、查询、选择、键盘、批量、上传、8 个弹窗、DnD、布局 | 可编排，但 DnD/下载策略/详情呈现应下沉 |
| `shell/AppShell.tsx` | 202 行 | 布局 + 会话动作 + 手写移动抽屉 + 2 个确认框 | 抽屉应独立且复用导航数据源 |
| `components/AdminUsersSection.tsx` | 282 行 / 8 state | 表格 + 筛选 + 3 个弹窗 + act-as 跳转 | 后续拆分（未在本次实施） |
| `components/SearchBox.tsx` | 261 行 | 输入 + 分组 + 键盘 + 排序/类型 + 2 个 query | 后续拆分（未在本次实施） |

### 2.2 复用性（本次已消除的重复）

- **导航**：`SidebarNav`（NavItem + 分区）与 `AppShell` 移动抽屉各自渲染一遍 SECTIONS，类名/圆角/行高不一致；抽屉还缺空间切换、存储用量、搜索入口。→ 抽屉改为独立组件并复用 `NavItem`/`sectionsFor`/`WorkspaceSwitcher`/`StorageMeter`/`AccountMenu`。
- **上传浮层**：`UploadPanel`（Browser 内）与 `GlobalUploadDock`（AppShell 级）同位置渲染、互相遮挡，且 Dock 的进度公式错误。→ 合并为唯一全局 Dock。
- **胶囊标签**：`Badge` 与 `Pill` 语义完全重叠（docs 已声明 Pill 为唯一出处，但 Badge 仍在 4 处使用）。→ 删除 Badge，统一 Pill。
- **行内按钮**：`RowAction` 定义在 FileList 里，被 `NodeRowActions`/`TrashPage` 反向依赖。→ 抽到 `components/RowAction.tsx`。
- **死代码**：`BrowserKpi` + `StorageRing`（零引用）、`nav.ts` 的 `NAV`（零引用）、`VirtualizedList.ROW_HEIGHT`（零引用）、`BrowserToolbar.batchBar`（从未传入）、`FileListHeader.view`（恒为 list）、`FileList.animStyle`（恒返回空对象）。→ 全部删除。

### 2.3 组件间通信

| 机制 | 使用处 | 评价 |
| --- | --- | --- |
| props 回调 | 绝大多数 | 主通道，合理 |
| Context | 仅上传队列（`UploadQueueProvider`） | 合理；但 value 是整包 API，进度更新会重渲染整个消费者子树（后续可拆 state/actions） |
| 模块级单例 store | `toast()`、`queryClient` | 合理；Toast 已上移到 App 层，公开分享页也能收到反馈 |
| URL | 目录 `?dir=`、标签 `?tag=`、设置子路由 | 合理；过滤 chips 未进 URL（后续） |
| localStorage | view / 列偏好 / 侧栏 / 并发 / 冲突 / 续传 / 皮肤密度 | 本次把 skin/density/conflict 三个游离键收进 `STORAGE_KEYS` |

**隐式契约**（重构时已保留）：`containerRef` 依赖行元素的 `data-file-row="index"`；行内容列顺序必须与 `gridStyle` 模板一致；`onDropMove` 同时决定 draggable 与放置目标。

## 3. 参数角度分析（props / 配置 / 状态 / 数据流）

### 3.1 props 与命名

- props 最多：`BrowserDialogs` 23、`FileList` 18、`FileListHeader`/`FileGrid` 12、`BrowserToolbar` 10。
- 同一概念多种命名：目录目标 `dir` / `parentId` / `to` / `toDirId`；选中态 `selected` / `selection` / `rowSelection` / `checked`；回调 `onXxx` 与直接透传 `setXxx` 混用（`BrowserDialogs`）。
- 隐式契约诚实度：TrashPage 给 FileList 传空实现 `onOpenDir={() => {}}`，说明「只读列表」模式应显式化（后续）。
- 已修正的默认值/配置问题：
  - 撤销文案写死「已移动」（改名也走同一 Snackbar）→ `useFiles` 返回 `{undoId, undoKind}`，文案按 kind 生成。
  - 撤销倒计时依赖每次渲染新建的 `onClose`，上传进度重渲染会不断重置 → `clearUndo` 改 `useCallback`，Snackbar 以 `key={undoId}` 重挂载，10s 常量进 `lib/constants.ts`。
  - `mstor_upload_conflict` 硬编码绕过 STORAGE_KEYS → 收口到 `STORAGE_KEYS.uploadConflict`。
  - `uniqueName`/`ConflictPolicy` 在组件里定义、被 hook 反向 import → 下沉 `lib/conflict.ts`。
  - `ApiError` 无请求路径，导致全局 401 处理无法区分业务接口与公开分享接口 → 增加 `path` 字段。

### 3.2 状态管理与数据流（本次修复的 P0/P1）

1. **分享提取码 401 被当成会话过期**：`/api/s/*` 的 401（提取码错误）会触发 `handleSessionExpired()`，把已登录用户整页送去 `/auth/renew`。→ `queryClient` 只在 `!error.path.startsWith("/api/s/")` 时续期。
2. **公开分享页没有 Toast**：`Toaster` 只挂在 AppShell 内，`/s/:token` 在 AppShell 之外。→ Toaster 上移到 `App` 根。
3. **MemberPanel 失效键写错**：`["workspace-members"]` vs 实际 `["members"]`，角色变更/移除后列表永远不刷新。→ 修正。
4. **创建分享后「已分享」角标不刷新**：未失效 `["shares"]`。→ 创建成功后 invalidate。
5. **Ctrl+A 在名称过滤输入框内被劫持**：键盘导航只对 Enter/Delete/F2/Space 判定了输入框。→ 全选前也判断 `inForm`。
6. **渲染期副作用**：`markSessionActive()` 在 `RequireAuth` 渲染期写 sessionStorage。→ 移入 `useEffect`。

### 3.3 配置项与常量

新增 `client/src/lib/constants.ts` 作为交互阈值/断点唯一出处：紧凑断点、详情栏断点、coarse pointer 查询、虚拟阈值、虚拟回退行数、长按阈值与点击抑制窗口、批量下载间隔、撤销展示时长。FileList / Browser / UndoSnackbar / VirtualizedList 已改为引用常量。

## 4. 布局 / 响应式 / 可访问性 / UX 分析

### 4.1 布局与滚动（已修复 P0）

- **11–49 行目录不可达**：只有 ≥50 行才走虚拟滚动，非虚拟分支没有滚动容器，而外层 `GlassCard` 是 `overflow-hidden`。→ 非虚拟分支补 `md:min-h-0 md:flex-1 md:flex-col` + 内部 `md:overflow-y-auto`（表头固定、单一滚动容器）。
- **1024–1279 详情栏挤压**：内联详情栏（288px）+ 固定列宽（约 556px 起）超出可用宽度，右侧操作列被裁切。→ 详情栏内联断点从 `lg(1024)` 提到 `xl(1280)`，更窄时回落到详情弹窗（一个 detail 状态仍只对应一个界面）。
- **底部 80px 死区**：`main` 使用为已删除的底部 Tab 预留的 `.pb-nav`（5rem）。→ 改为 `.pb-safe`（安全区 + 1rem）。
- **移动端入口缺失**：搜索/空间切换/存储用量/账户只在桌面侧栏。→ 抽屉补齐这些入口（含搜索）。
- **无跳转链接/文档标题**：→ 增加「跳到主要内容」skip link、`main#main-content`、路由级 `document.title`、文件页 `sr-only h1`。

### 4.2 响应式与触屏交互（已修复 P0）

- **移动端单击=选中、双击=打开**：触屏双击不可靠，点文件夹只是选中。→ coarse pointer 下**单击=打开、长按 500ms=多选**，并用时间戳抑制长按后补发的 click（避免「刚选中又被打开」）；桌面行为不变（单击选中、双击打开、Shift 范围选）。
- **抽屉不是真对话框**：手写 `div role="dialog"` 无焦点陷阱/Esc/焦点还原/滚动锁。→ 改用 Radix Dialog（与 `ui/Dialog` 同一底座）：焦点陷阱、Esc、遮罩点击、滚动锁定、关闭后焦点还原，标题/描述走 sr-only。
- **焦点环改变按钮形状**：全局 `:focus-visible` 规则里带 `border-radius: var(--radius-btn)`，圆形图标按钮聚焦时变方形。→ 只保留 box-shadow，颜色改用 `--color-primary`（不再硬编码旧薄荷青）。
- **对比度**：`ink-3` 用于 11px 文本但仅 3.2–3.7:1。→ 浅色 `#8a857f → #6b665f`（canvas 5.5:1）、slate `#7d8b98 → #5f6c78`（4.9–5.0:1）、暗色 `#74879a → #8b9cae`（5.8:1）、ink 皮肤 `#78828c → #87919b`（5.3:1）。
- 触控目标：IconButton/Button/抽屉项已有 `.tap`（coarse 下 44px）；行内 `RowAction` 仍为 28px（保持桌面密度，后续可收进「…」菜单）。

### 4.3 视觉令牌治理（已修复 P1）

- 删除 `.state-layer` 重复定义块（其中一份还引用未定义的 `--motion-press`）。
- 8 处调色板直写改语义令牌：`accent-emerald-600 → accent-primary`、`hover:bg-blue-50 → hover:bg-primary-soft`、`hover:bg-violet-50 → hover:bg-chip-violet-bg`、`bg-gray-300 → bg-line-strong`。
- 15 处硬编码 `bg-white` 改 `bg-surface-1/2`（Input/Skeleton/FileList 网格卡/表头搜索与菜单/筛选 chips/WorkspaceSwitcher/SearchBox/MemberPanel/ErrorBoundary/PreviewModal/Browser 拖拽层），修复暗色与 `data-skin="ink"` 下的白底混搭。
- `.glass-strong/.glass-modal` 背景从固定 `rgb(255 255 255 / .8)` 改为基于 `--color-surface-2` 的 `color-mix`，皮肤/暗色下不再强制白玻璃。
- 圆角 `--radius-chip` 对齐文档（6→8）。

## 5. 问题清单与优先级（汇总）

| 优先级 | 问题 | 处理 |
| --- | --- | --- |
| P0 | 分享提取码 401 触发整页重登；公开页无 Toast | ✅ 已修 |
| P0 | 上传进度算错 100 倍 + 两个上传浮层重叠 | ✅ 已修（合并 Dock） |
| P0 | 移动端抽屉无焦点陷阱/Esc/焦点还原，导航重复实现 | ✅ Radix 抽屉 + 单一数据源 |
| P0 | 移动端单击只能选中，无法打开文件 | ✅ coarse 指针单击打开/长按多选 |
| P0 | 11–49 行列表被 `overflow-hidden` 裁切且不能滚 | ✅ 补滚动容器 |
| P0 | 1024–1279 详情栏导致行溢出、操作列被裁 | ✅ 详情栏断点提到 xl |
| P0 | MemberPanel 失效键错误，成员列表不刷新 | ✅ 已修 |
| P0 | 撤销文案固定「已移动」、倒计时被进度重渲染重置 | ✅ kind + 稳定回调 + key |
| P1 | 令牌漂移（调色板直写/白底/焦点环/ink-3 对比度） | ✅ 已修 |
| P1 | Badge/Pill、RowAction、死代码重复 | ✅ 已收敛 |
| P1 | Ctrl+A 劫持输入框、分享角标不刷新、渲染期写 sessionStorage | ✅ 已修 |
| P1 | 错误态被空态掩盖（收藏/最近/标签/回收站/分享/审计） | ⏳ 后续 |
| P1 | 批量条 3 份、模态外壳 3 套、搜索框 4 份、骨架 5 份 | ⏳ 后续 |
| P1 | 上传 context 全量订阅导致整页重渲染 | ⏳ 后续（拆 state/actions） |
| P1 | queryKey 未集中、上传逐文件失效 `["files"]`（N×D 请求） | ⏳ 后续 |
| P2 | MoveDialog 目录树 N+1、无错误态/取消 | ⏳ 后续 |
| P2 | 服务端契约漂移（AdminUser.role/quota null、search cursor、recordView、分享 password_hash 下发） | ⏳ 需前后端联动 |
| P2 | PWA 更新提示、theme-color 不一致、/`design` 进主包 | ⏳ 后续 |

## 6. 逐步骤实施（改动理由 → 预期收益）

### Step 1 · 设计令牌与视觉一致性

- 文件：`client/src/index.css`、FileList/FileListHeader/FileFilters/Input/Skeleton/WorkspaceSwitcher/SearchBox/MemberPanel/ErrorBoundary/PreviewModal/Browser。
- 做了什么：删重复 `.state-layer`；焦点环改用主色令牌并去掉改形状的 border-radius；ink-3 提对比度；`.pb-nav→.pb-safe`；`--radius-chip` 对齐；`.glass-strong` 背景令牌化；8 处调色板直写与 15 处 `bg-white` 全部改语义令牌。
- 理由：设计系统文档承诺「颜色只用语义令牌 / 焦点环不覆盖组件形状 / ink-3 ≥4.5:1」，实现与文档、暗色/皮肤行为均不一致。
- 收益：暗色与 ink 皮肤真正可用；键盘焦点环不再破坏圆形按钮；对比度达 WCAG AA；后续新增组件有可依循的单一颜色来源。

### Step 2 · 原语收敛、死代码清理、FileList 减负

- 文件：新增 `components/RowAction.tsx`、`lib/constants.ts`；改 `ui/index.ts`、AccountMenu、FileList、FileListHeader、FileGrid/FileRow（经 FileList）、Field、nav、VirtualizedList、BrowserToolbar、DesignPage、TrashPage、NodeRowActions、三处测试；删除 `ui/Badge.tsx`、`BrowserKpi.tsx`、`StorageRing.tsx`。
- 做了什么：Badge→Pill 单一出处；RowAction 独立成文件（消除展示组件反向依赖）；`Field` 用 `cloneElement` 注入无障碍属性（保留 ref/元素身份）；FileList 改用 `useMediaQuery`（删除手写 matchMedia）、删死代码、移动端交互修复、非虚拟分支补滚动容器；清理 `NAV/ROW_HEIGHT/batchBar/view/animStyle`。
- 理由：重复实现是后续改动的最大风险源；展示组件应只负责布局与行契约。
- 收益：`FileList` 减少约 60 行且职责收敛；原语数量与文档一致；删除 3 个零引用组件与 5 个死导出；非虚拟列表可滚动、移动端可打开文件。

### Step 3 · 外壳与导航单一来源（移动端 + a11y）

- 文件：新增 `shell/MobileNavDrawer.tsx`；重写 `shell/AppShell.tsx`；`nav.ts` 删除 NAV。
- 做了什么：抽屉改用 Radix Dialog（焦点陷阱/Esc/遮罩/滚动锁/焦点还原）；导航直接复用 `sectionsFor + NavItem`；抽屉底部补 `CommandPalette`（移动端搜索）、`WorkspaceSwitcher`、`StorageMeter`、`AccountMenu`；路由切换自动关闭抽屉；skip link、`main#main-content`、`document.title`、文件页 `sr-only h1`。
- 理由：手写 dialog 不满足 aria 契约；移动端功能入口缺失；导航两份实现会持续分叉。
- 收益：移动端可搜索/切空间/看配额/退出；同一批链接只维护一份；新增 `AppShell.test` 抽屉开关与 `a11y.test` 抽屉 axe 用例作为回归闸门。

### Step 4 · 上传浮层合并、会话/错误分流、撤销与失效修正

- 文件：重写 `GlobalUploadDock`；删除 `UploadPanel`；`api/client.ts`、`shell/queryClient.ts`、`App.tsx`、`useFiles`、`UndoSnackbar`、`useKeyboardNav`、`ShareDialog`、`MemberPanel`、`useBrowserUpload`、`lib/{storage,appearance,conflict}.ts`、`Browser`。
- 做了什么：唯一全局上传 Dock（修复 `size*progress/100` → `size*progress`，单项进度统一 ratio 换算）；`ApiError.path` + `/api/s/*` 401 不再触发重登；Toaster 上移 App；撤销 `{id, kind}` + 稳定回调 + 常量；MemberPanel 失效键修正；创建分享失效 `["shares"]`；Ctrl+A 输入框保护；冲突策略/唯一命名下沉 lib 并收口 STORAGE_KEYS。
- 收益：修复两个用户可感知的真实 bug（进度 1%、分享页被踢去登录）；两个上传浮层不再互相遮挡；撤销条文案/倒计时正确；错误反馈在公开页可见。

### Step 5 · 页面编排减负、常量集中、详情断点

- 文件：新增 `hooks/useDropUpload.ts`、`components/DropOverlay.tsx`、`lib/constants.ts`；`lib/download.ts`、`Browser.tsx`、`FileList.tsx`、`UndoSnackbar`、`VirtualizedList`。
- 做了什么：拖拽上传逻辑与覆盖层从 Browser 抽出；批量下载策略收进 `downloadMany`；详情栏断点常量（xl）；虚拟阈值/回退行数/长按/下载间隔/撤销时长集中。
- 收益：Browser 不再同时承载 DnD 细节；策略可单测/复用；阈值不再散落且互相矛盾。

## 7. 验证

| 闸门 | 结果 |
| --- | --- |
| `tsc -p client --noEmit` | 通过 |
| `eslint .` | 通过 |
| `vitest run --config vitest.client.config.ts` | 通过：34 个测试文件 / 207 例（基线 33 / 204） |
| `npm run build` | 通过 |
| 行为契约 | 既有 `data-testid`（drop-zone/overlay、mobile-drawer、file-list-container、file-grid、file-virtual、dialog-*、empty-state、status-bar、undo-snackbar）、`role=row`、aria-label、localStorage 结构（`mstor_files_table`/`mstor_view`/`mstor_sidebar`）保持不变；仅新增抽屉与 Dock 的回归用例 |

测试改动（均属于契约对齐，非放宽断言）：
- `ui.test`/`a11y.test`：Badge → Pill（与被测组件一致）。
- `ShareDialog.test`：为组件补 `QueryClientProvider`（组件创建成功后要失效 `["shares"]`）。
- 新增 `GlobalUploadDock.test`：0..1 ratio 的回归断言（50% 不能显示成 1%）。
- 新增 `AppShell.test` 抽屉开关/Esc 用例、`a11y.test` 抽屉 axe 用例。

### 7.1 独立复核后的补修（第二轮）

复核结论 P0=0，另报 3 个 P1，已全部修复并补验：

1. **skip link 聚焦被覆盖**：`focus:z-toast` 不是可生成的 utility（z-toast 是自定义类）。改为常驻 `z-toast`（sr-only 时无副作用），聚焦时 `focus:fixed` 叠加即可置顶。
2. **抽屉跨 md 断点导致 body 锁死**：Radix 打开时锁滚动，若此时视口跨过 768px，抽屉被 `md:hidden` 隐藏但锁仍存在。抽屉内用 `useMediaQuery(DESKTOP_MEDIA_QUERY)` + effect 自动关闭；同时桌面浮动簇改为按断点条件挂载，避免同一页出现两个 CommandPalette。
3. **回收站触屏单击无反应**：coarse 分支统一「单击=打开」，但回收站没有打开语义。新增 `FileList.tapOpens`（默认 true，回收站 false），false 时回落为选择；长按抑制窗口改为从松手时刻计时（此前长按超过 600ms 后松手仍可能打开），行上补 `select-none` / `[-webkit-touch-callout:none]`。
4. 顺带：完成项不再常驻 Dock（只显示进行中/暂停/失败，去掉会误删失败项的「清空已完成」）；slate/ink 皮肤 ink-3 再提对比度；`:focus-visible` 与 `.pb-safe` 层叠问题消除（改用 Tailwind 任意值 utility）；`/design` 补页名；文档 4 处漂移修正。

## 8. 第二轮：网格视图异常修复 + 继续重构

### 8.1 网格视图异常：根因逐条定位

| # | 现象 | 根因（证据） | 修复 |
| --- | --- | --- | --- |
| G1 | **选中卡片没有任何高亮** | 卡片容器固定 `bg-surface-1`；构建产物中 `.bg-primary-soft/60`（偏移 24856）在 `.bg-surface-1`（25109）之前，同属性后者胜出 → 选中 tint 被覆盖。列表视图没有常驻背景色所以正常。 | 网格选中改为 `border-primary + ring-2 ring-primary/45`，与底色解耦；新增回归断言 `toHaveClass("border-primary", "ring-2")`。 |
| G2 | **网格里没有下载/分享/重命名/移动/删除入口** | 列表视图靠操作列渲染 `actionCell`；网格分支只渲染 `FileCard`（缩略图+名称），操作只能右键（触屏无右键）。 | `FileCard` 增加右上操作组：桌面 hover/focus-within 出现、触屏常显；FileList 默认注入 `actionCell`，只读列表（回收站）用 `gridActions` 注入「恢复/彻底删除」，避免把已删除文件渲染成可下载链接。 |
| G3 | **切到网格后名称过滤输入整个消失** | `FileList` 把「名称过滤 + 列菜单 + 表头」整体只挂在 list 分支；grid 提前 return。 | 抽出 `NameFilterInput`（`FileListHeader.tsx`），网格在卡片区上方渲染过滤条 + 结果计数；列显隐/排序仍只属于列表（网格不适用）。 |
| G4 | **触屏长按在网格无法多选** | `FileGrid` 只接了 `dragProps/dropProps/onContextMenu`，漏了 `touchSelectProps`；coarse 单击=打开后，网格里只剩 16px checkbox 能选。 | 行事件统一为 `cellHandlers`（右键/长按/拖拽/放置）由 FileList 构造，列表与网格共用；新增长按回归用例。 |
| G5 | **网格键盘 ↑↓ 只移动一格（沿 DOM 顺序），不是上一行/下一行** | `useKeyboardNav` 只有 `horizontal` 标志，↑↓ 恒 ±1；网格是二维布局。 | 读取容器实际 `grid-template-columns` 的轨道数作为步长（随 2/3/4/6 列断点与详情栏变化），读不到时退化为 1；顺带补 Home/End。新增 3 列网格用例。 |
| G6 | **Tab 键会逐个停在每张卡片内部按钮上** | `FileCard` 的 `<button>` 无 `tabIndex=-1`，N 个文件 = N 个无名动作的停靠点，与容器 roving focus 重复。 | 卡片改为非交互容器（整卡由容器的 `data-file-row` 焦点承担），与 `FileRow` 名称按钮的 `tabIndex={-1}` 一致。 |
| G7 | **表格/审计粘性表头背景透明、滚动时文字叠字** | `bg-surface-sunken` 不是 @theme 色名（只有 `--surface-sunken` / `--color-bg-sub`），Tailwind 不生成该类。 | 两处改为 `bg-bg-sub`。 |
| G8 | **网格卡片对文件夹显示「-」** | `formatBytes(null)` 直接返回 `-`；卡片没有区分文件夹。 | 卡片元信息显示「文件夹」。 |

### 8.2 继续重构（来自第一轮 §8 的 1–3 项）

- **查询三态统一**：新增 `components/AsyncState.tsx` + `ui/ListSkeleton.tsx`。收藏/最近/标签、回收站、分享、审计、平台用户管理统一为 pending → 骨架、error → 可重试错误态（`friendlyMessage` 首次真正接入业务）、ready → 内容；页面不再把请求失败伪装成「空」。同时删掉 4 处手写骨架循环。
- **批量浮条统一**：新增 `components/SelectionBar.tsx`，`BatchBar`、回收站、分享页共用定位/容器/「已选 N 项」/取消；各页只注入自己的动作按钮。
- **queryKey 工厂**：新增 `lib/queryKeys.ts`，全部 20+ 处字面量收敛（含 `members` 键、收藏/最近跨页缓存共享、分享详情/子目录）；`["files"]` 前缀失效仍兼容。
- **上传刷新降噪**：完成项不再逐文件 `invalidateQueries(["files"])`，改为 400ms 合并窗口 + drain 结束立即补一次（N 文件 × D 目录 → 常数级请求），并加卸载清理。
- **文档/令牌**：修正 design-system 的强调色/圆角/ink 对比度/设置子路由等漂移；新增 `ListSkeleton` 登记；网格契约写入 §4。

### 8.3 验证

| 闸门 | 结果 |
| --- | --- |
| `tsc -p client --noEmit` | 通过 |
| `eslint .` | 通过（0 warning） |
| `vitest --config vitest.client.config.ts` | **35 文件 / 216 例通过**（新增：网格过滤+操作组、网格选中态、网格长按、网格列步进、Home/End、AsyncState 三态、断网文案、输入框键盘守卫） |
| `npm run build` | 通过 |

行为契约仍保持：`file-grid` / `file-list-container` / `drop-zone` / `mobile-drawer` 等 testid、`role=row`、aria-label、localStorage 结构不变；网格新增操作组是纯增量的可发现性改进（列表视图 DOM 不变）。

### 8.4 第二轮独立复核后的补修

复核结论 P0=0，另报 2 个 P1 与若干 P2，已修复：

1. **iPad/触屏笔记本上网格操作组「不可见但可点」**：`md:opacity-0 + md:group-hover` 用宽度断点假设了 hover 能力。→ 操作组加 `.grid-card-actions`，在 `@media (hover: none)` 下强制常显（触屏可点区域与视觉一致）。
2. **AsyncState 在「有缓存 + 后台刷新失败」时丢弃缓存**：TanStack v5 置 `status:"error"` 但保留 `data`。→ `isError && data === undefined` 才整页错误态；有数据时顶部内联「更新失败（显示缓存内容）+ 重试」，与 OfflineBar 语义一致。
3. 顺带：卡片操作组补 `onTouchStart/Move` 阻断（避免按住操作按钮触发 500ms 长按选中）；网格操作组改为「下载 + 更多菜单」（复用右键菜单 `menuItemsFor`），解决手机 2 列卡片 6 个按钮超宽被裁；列表过滤框不再被 ↑↓/Home/End 劫持；400ms 合并窗口只刷列表、`/api/me` 留到 drain 收尾；`friendlyMessage` 把断网 `TypeError("Failed to fetch")` 映射为中文网络文案；SelectionBar 改安全区偏移；新增 `AsyncState` 三态、断网文案、输入框键盘守卫用例。

## 9. 第三轮：浮层 a11y、目录选择器、按需加载

### 9.1 目录选择器（MoveDialog）重构

| 问题 | 根因 | 修复 |
| --- | --- | --- |
| 大目录下「移动/复制」打开很慢 | `listDirOptions` 串行 DFS 递归，每个目录一次 `GET /api/files`（N+1，串行等待） | 改 BFS 逐层并发（每层最多 6 路，避免打爆连接数），层内并行；深度上限保留 8 |
| 请求失败永远停在「加载中…」 | `.then(setDirs)` 无 catch，`dirs` 恒 null，确定按钮永久禁用 | `LoadState` 三态：loading/error(可重试)/ready；失败显示 `friendlyMessage` + 重试，卸载/关闭后丢弃结果 |
| 目标列表不是合法 listbox | `role="listbox"` 下只有 `button`，没有 `option`/选中语义 | 改为普通按钮组 + `aria-pressed`，并显示「目标：当前选中」；长路径 `truncate` + title |
| 排除自身子树 | 递归时 `continue` 跳过 excludeId 后不再入队，后代确实不会被遍历（原实现已正确） | 保留语义并补测试（`listFiles` 不会请求被排除目录） |

新增 [MoveDialog.test.tsx](client/src/components/MoveDialog.test.tsx)：嵌套列表、选中提交、根目录提交、excludeId 子树、失败重试、取消。

### 9.2 浮层与可访问性

- **ConflictDialog → ui/Dialog（Radix）**：删除手写 `role=dialog` 外壳，继承焦点陷阱/Esc/遮罩/焦点还原；a11y 闸门改为对 `baseElement` 扫描（Portal 到 body）。
- **通知面板**：打开后焦点移入面板，Esc 关闭并把焦点还给铃铛；点外部关闭不抢焦点。
- **EmptyState**：标题 `h3 → h2`，页面 h1 之下不再跳级；新增 `SearchInput` 统一列表过滤/审计筛选/用户搜索 3 处。

### 9.3 按需加载

`/design` 与 `/platform/*` 改 `React.lazy` + `Suspense`：首屏主 JS 664.06 → 651.6 kB（gzip 211.2 → 208.3 kB），`DesignPage`（7.4 kB）与 `PlatformPage`（10.5 kB）成为独立 chunk；管理页访问时才有网络开销。

### 9.4 验证

| 闸门 | 结果 |
| --- | --- |
| `tsc -p client --noEmit` | 通过 |
| `eslint .` | 通过（0 warning） |
| `vitest --config vitest.client.config.ts` | **37 文件 / 229 例通过**（新增 MoveDialog 8、ConflictDialog 2、通知 Esc 焦点 1、懒加载路由 1、a11y 拆分 1） |
| `npm run build` | 通过（含 lazy chunk） |

### 9.5 复核补修

复核结论 P0=0、P1=1，均已修复：

1. **Suspense 位置过高会卸载外壳与上传队列**：`ErrorBoundary > Suspense > Routes` 在懒 chunk 首次加载时会把 AppShell/UploadQueueProvider 整棵卸掉——正好违背「切换路由不丢队列」。→ Suspense 下移到 AppShell 的 `main` 内包 `<Outlet/>`（位于 compact ErrorBoundary 之内）：外壳、侧栏、队列保持挂载；chunk 失败也由页面级边界接住。
2. **MoveDialog 关闭后仍继续扫描**：`listDirOptions(excludeId, isCancelled?)` 增加取消回调，每层/每批请求前检查；同时修正 BFS 深度与旧 DFS 对齐（最多第 8 层）、收集后按全路径排序（A → A/A1 → B，恢复层级相邻的阅读顺序）、确定按钮 busy 时显示「处理中…」。
3. a11y 用例拆分：ConflictDialog（Radix modal，扫 baseElement）与 BatchBar/UndoSnackbar（非 modal，扫 container）分开，避免 Radix `hideOthers` 把兄弟节点 aria-hidden 导致空转。
4. `Input` 改用 `cn()` 合并类名（搜索框背景覆盖不再依赖 CSS 生成顺序）。
5. 通知面板 Esc 改为 `document` 监听（Tab 走出面板后仍可关闭），并新增批量/取消/排序 3 条 MoveDialog 用例。

## 10. 第四轮：上传队列订阅拆分与体验优化

### 10.1 上传队列 Context 拆分（消除上传时整页重渲染 + 重复队列）

问题：
- `UploadQueueProvider` 把整个队列 API 作为单一 context value，进度每 100ms 变一次 → Browser 整页子树重渲染；
- `useUploadQueueContext` 为了「页面测试没有 Provider」的兼容，每次消费都额外调用 `useUploadQueue()` 兜底 → 同一页面可能创建第二份队列（状态分叉）；
- 上传完成后逐文件失效 `["files"]`（已在第二轮改 400ms 合并）。

修复：
- 拆成 **StateContext（items）** 与 **ActionsContext（add/retry/cancel/purge/clearFinished）**。Actions 是 hook 内的 `useCallback`，Provider 用 `useMemo` 固定引用；进度变化只让 Dock/StatusBar 重渲染，Browser 只订阅 actions。
- Provider 改为必需：缺失时抛 `useUploadQueueState/Actions 必须在 <UploadQueueProvider> 内使用`，删除隐藏的第二份队列。
- 测试：Provider 稳定性用例（items 变化时 actions 引用不变）、Provider 外使用抛错；Browser 测试补 Provider 包装。

### 10.2 通知角标初始值

铃铛此前只在打开面板后拉 `/api/notifications`，未读角标初始恒为 0（即使 `/api/me.unreadNotifications > 0`）。`NotificationBell` 增加 `initialUnread`，AppShell 用 `me.unreadNotifications` 传给桌面浮动簇与移动 TopBar。

### 10.3 收藏乐观更新

收藏/取消收藏此前「请求成功后才 refetch」，星标反馈有延迟且失败无回滚。`useBrowserQuery.toggleFavorite` 现在先写 `["favorites"]` 缓存（立即反映星标），成功后再 refetch 对齐服务端顺序，失败回滚到请求前快照并 toast。

### 10.4 上传分片并发封顶

队列并发 N 文件 × 每文件 N 分片 = N² 个在途 XHR（设置 16 时峰值 256）。新增 `MAX_PART_CONCURRENCY = 4`：`concurrency = min(队列并发, 4)`，设置页文案同步为「同时上传的文件数；每个大文件最多 4 个分片并发」。

### 10.5 验证

| 闸门 | 结果 |
| --- | --- |
| `tsc -p client --noEmit` | 通过 |
| `eslint .` | 通过（0 warning） |
| `vitest --config vitest.client.config.ts` | **38 文件 / 233 例通过**（新增 Provider 2、通知初始角标 1、分片并发 1） |
| `npm run build` | 通过 |

### 10.6 提交与推送

第一至三轮改动已提交并推送：`6e48cde refactor(client): 系统性重构组件/状态/布局与无障碍…` → `origin/master`；本轮改动在同一条质量闸门通过后单独提交推送。

## 11. 第五轮：前后端契约对齐与安全/缺陷修正

### 11.1 AdminUser 契约

服务端 `/api/me/admin/users` 实际返回 `platform_admin: 0|1`（不返回 `role` 别名），且无个人空间的用户 `quota_bytes` 为 `null`；客户端类型却声明 `role: "admin"|"member"`、`quota_bytes: number` → 角色列永远显示「成员」，配额弹窗对 null 得到 0/NaN。

修复：
- `api/types.ts`：`platform_admin: 0 | 1`、`quota_bytes: number | null`，并注释服务端列名与 null 语义。
- 用户管理：角色 Pill 按 `platform_admin === 1`；无个人空间显示「未绑定空间」并禁用「编辑配额」（服务端会 400，前端提前阻断），title 说明原因；配额弹窗初始值对 null 显示空。
- 测试：a11y/PlatformPage 的 mock 改用 `platform_admin`；新增「管理员映射 + 未绑定空间 + 按钮禁用」用例。

### 11.2 分享列表脱敏

`GET /api/shares` 原用 `SELECT s.*`，把 `password_hash`（以及 `workspace_id` 等内部列）透传到前端。改为显式列（id/node_id/token/expires_at/downloads/max_downloads/last_download_at/created_at + node 三列）。本地 server 断言补充「列表不得包含 password_hash/workspace_id」。

### 11.3 分享页下载提取码

下载原使用实时输入框的 `password`，而真正解锁用的是已提交的 `usedPassword`；两者在「解锁后又改输入框」时会不一致。改为 `usedPassword || undefined`，与分享详情/子目录请求同源。

### 11.4 验证

| 闸门 | 结果 |
| --- | --- |
| 客户端 `vitest` | **38 文件 / 234 例通过** |
| 服务端 `tsc --noEmit` | 通过 |
| 服务端本地用例 `npm run test:server:local` | **29 项通过**（workerd 版 `npm run test:server` 在本机仍因 `ERR_RUNTIME_FAILURE` 起不来，按 README 走 node:sqlite 垫片） |
| 客户端 `tsc` / `eslint` / `vite build` | 通过 |

## 12. 第六轮：「最近访问」链路补全

服务端早已提供 `POST /api/library/views/:id`（`recordView`，同节点 5 分钟节流），但前端从未调用 → 「最近」页在真实使用中永远为空（只有测试/种子数据可见）。

修复：
- `api/library.ts` 增加 `recordView(nodeId)`；
- `Browser` 进入目录时上报（`openDir`，失败静默、不阻塞导航）；
- `PreviewModal` 挂载时上报（覆盖双击/键盘/右键等所有预览入口）；
- 测试：Browser 新增「进入目录记录访问」「打开文件预览记录访问」两例；PreviewModal 的 fetch 断言改为定位 content 请求（挂载时多了一次 views POST）。

验证：客户端 **38 文件 / 236 例**；双 `tsc`、`eslint`、`vite build` 全绿。

## 13. 第七轮：组件拆分、错误去重、PWA 更新提示（按列表顺序）

### 13.1 AdminUsersSection / SearchBox 拆分

- `AdminUsersSection` 282 → 约 150 行：`components/admin/{QuotaDialog,EmailDialog,UserRow,shared}`；本文件只保留查询、筛选、编排。
- `SearchBox` 261 → 约 45 行：`hooks/usePaletteSearch` 承载查询/分组/键盘/点外关闭/跳转，`components/search/PaletteResults` 渲染下拉，`Highlight` 与 Palette 类型/静态操作拆到 `components/search/Highlight.tsx` / `lib/palette.ts`（hook 不反向依赖组件）。
- 行为/DOM/aria 保持不变，SearchBox/CommandPalette/a11y 用例全过。

### 13.2 查询错误内联化去重 + enabled:false 防御

- `AsyncState`：`isPending && fetchStatus === "idle"`（查询被 enabled:false 禁用）直接渲染 children，不再永久骨架。
- `queryClient`：查询 `meta.silent = true` 时跳过全局错误 toast；Browser files / Library / Trash / Shares / Platform overview / AdminUsers / Share 详情与子目录等自带错误 UI 的查询已标记，避免「页面错误态 + 全局 toast」重复提示。
- 新增 `shell/queryClient.test`（silent 不弹 / 普通仍弹）与 AsyncState 禁用查询用例。

### 13.3 PWA 更新提示与 Toast 动作

- `vite-plugin-pwa` `registerType: "autoUpdate" → "prompt"`：新 SW 等待用户确认。
- `main.tsx`：`onNeedRefresh` 弹出「发现新版本，刷新即可更新」并带「刷新」动作（`updateSW(true)`）；`onOfflineReady` 提示可离线使用。
- `Toaster` 增加可选 `action`（`Toast.Action`），前两参签名不变，35+ 既有调用点零改动。
- `index.html` theme-color 与 manifest 对齐 `#f4f6f4`。
- 新增 Toaster 动作按钮用例；客户端 **40 文件 / 240 例**、tsc/eslint/build 全绿（构建产物 PWA precache 11 项）。

## 14. 第八轮：标签写接口 UI

此前标签只能「看」：服务端已有创建/删除/打标/解绑接口，前端没有入口。本轮补齐：

- **服务端**：新增 `GET /api/library/node-tags/:nodeId`（`listNodeTags`）回显某节点已打标签；节点不属于当前空间返回 404。独立路径避免与 `/tags/:tagId/nodes` 路由歧义。本地 node:sqlite 垫片补「回显 1 个标签」「解绑后为空」「跨租户读 404」断言。
- **客户端 API**：`createTag/deleteTag/attachTag/detachTag/listNodeTags`；`queryKeys.nodeTags(nodeId)`。
- **TagDialog**（新）：勾选即时打/解标签（乐观更新，失败回滚）、显示每个标签节点数、输入新标签名「创建并添加」（创建后自动打在当前节点）。
- **入口**：Browser 右键菜单新增「标签…」；DetailPane 新增「标签」按钮。
- **LibraryPage 标签页**：新建标签表单；选中标签后可「删除该标签」（ConfirmDialog 二次确认，删除后回列表并失效 `["library","tags"]` 刷新计数/列表）。
- 测试：TagDialog 2 例（回显/勾选、创建并添加）、LibraryPage 2 例（新建、删除确认）、a11y 标签弹窗；本地 server 29 项。
- 验证：客户端 **42 文件 / 245 例**；双 `tsc`、`eslint`、`vite build` 全绿。

## 15. 第九轮：命令面板搜索游标分页

服务端 `/api/search` 已返回 `nextCursor`（recent 用 keyset、name/size 用偏移），前端此前只展示首屏 50 条。

- `SearchResult` 补 `nextCursor?: string | null` 类型；
- `usePaletteSearch` 改 `useInfiniteQuery`：首屏请求保持既有 `{q,sort,type}` 签名，后续页才带 `cursor`；`getNextPageParam` 直接取服务端游标；
- 多页合并 nodes/paths（`useMemo`），键盘导航/分组天然覆盖已加载结果；
- `PaletteResults` 底部「加载更多结果」：无下一页隐藏、加载中禁用；
- 新增 SearchBox 分页用例（首屏 nextCursor → 点击加载更多 → 断言 cursor 与追加结果）。
- 验证：客户端 **42 文件 / 246 例**；双 `tsc`、`eslint`、`vite build` 全绿。

## 16. 第十轮：清理与设计系统登记

- **删除死代码**：`useUploadQueue.clearFinished` 已无消费者（上传浮层只展示未完成项），从 hook/Provider/测试移除，减少一份「会误删失败项」的 API。
- **底部浮层统一**：新增 `.dock-bottom`（移动端 `safe-area + 4.5rem`，sm+ `1.5rem`），SelectionBar / BatchProgress / GlobalUploadDock 共用，替代各自写死的 `bottom-20/24`。
- **/design 登记**：补充 `SearchInput` 与 `AsyncState` 演示（后者用 `Surface` 包裹以满足「禁止手写卡片外观」的 lint 规则）。
- 验证：客户端 **42 文件 / 245 例**（删除 1 例死 API 测试）；双 `tsc`、`eslint`、`vite build` 全绿。

## 17. 第十一轮：设计令牌对比度闸门

把 `docs/design-system.md` 的「≥4.5:1」从文档承诺变成 CI 断言：

- 新增 `client/src/test/contrast.ts`（测试工具）：从 `client/src/index.css` 提取 `@theme`、暗色媒体块、slate/ink/brutal 皮肤块；递归解析 `var()` 令牌链，解析 hex/rgb(a) 与半透明色（半透明浅底先与其所在 `surface-1` 合成），按 WCAG 相对亮度计算对比度。
- 新增 `client/src/test/contrast.test.ts`：5 个变体（默认亮色 / 暗色 / slate / ink / brutal）× 18 组前景-背景（ink/ink-2/ink-3 × 4 种表面、状态色 text/soft、chip fg/bg）全部断言 ≥4.5:1。
- 闸门立即抓出并修复两处真实缺陷：
  - 亮色 `chip-amber-fg` 在 `chip-amber-bg` 上仅 **4.45:1** → `#b45309 → #a64a06`（约 4.65:1）；
  - brutal 皮肤 `ink-3` 在 `bg-sub` 上仅 **4.07:1** → `#6d6d6d → #626262`（约 4.6:1）。
- 验证：客户端 **43 文件 / 250 例**；双 `tsc`、`eslint`、`vite build` 全绿。

## 18. 第十二轮：目录树一次性接口

移动/复制目标选择此前用「逐层 BFS 并发」扫全树：每个目录一次 `GET /api/files`（大目录仍多次请求，且前端还要处理取消/截断）。

- **服务端**：新增 `GET /api/dirs/tree`，一次返回当前空间全部目录（`id/parent_id/name/path`，排除 `name=''` 的根哨兵行，上限 5000 + `truncated` 标记）。
- **客户端**：`api/nodes.listDirTree`；`MoveDialog.listDirOptions` 改为一次请求 + 前端建树（按父 id 分组、`zh-CN` 名称排序、`excludeId` 整棵子树跳过、深度上限 8），返回 `{ options, truncated }`；弹窗新增「目录过多，仅显示前 5000 个」提示。取消/失败重试语义保持不变。
- **测试**：MoveDialog 测试改为 mock `listDirTree`（7 例：嵌套/根目标/exclude/truncated/失败重试/取消/关闭）；Browser 移动测试补 `listDirTree` mock；本地 server 垫片补目录树断言（2 个目录 + parent 关系 + truncated=false）。
- 验证：客户端 **43 文件 / 249 例**；server 本地 29 项；双 `tsc`、`eslint`、`vite build` 全绿。

## 19. 第十三轮：v7 UI/UX 重构 · Calm Workspace

### 19.1 为什么重做视觉方向

现有 v6 的核心问题不是「不够漂亮」，而是**演示感压过工具感**：

1. **装饰优先**：彩色光晕 + 多层玻璃 + 斜向高光 + spring 弹跳，视觉噪声高于文件管理所需；
2. **双强调色**：亮色靛蓝 `#4c5bd4`、暗色薄荷青 `#2dd4bf`，品牌感知断裂；
3. **桌面 chrome 分散**：没有顶栏，搜索/通知漂在右下角，导航、账户、空间、存储都塞在侧栏；
4. **页面标题不统一**：有的页面 h1 + 说明，有的只有 h1，有的（文件页）没有可见标题；
5. **列表噪声**：斑马纹 + 常驻 6 个行内图标 + 卡片阴影 + 选中 ring 叠加；工具栏把筛选、上传、新建、视图全平权，缺少主操作。

### 19.2 新方向（已落地）

**Calm Workspace：安静、一致、内容优先的专业工作台。**

- 单一中性冷灰画布；**删除彩色光晕/渐变/sheen/玻璃模糊**，表面 = 实色 + 1px 发丝边 + 两级克制阴影。
- **唯一靛蓝强调色**（亮 `#4f46e5` / 暗 `#818cf8`）；状态色只表达状态；文件类型 chip 低饱和。
- 排版收紧：基准 14px、页面标题 20px、行高 44（紧凑 38）、圆角 6/8/10/12。
- 动效从 spring 弹跳改为 120/180/240ms 的 ease-out；reduced-motion 全归零。

**信息架构：**

- 新增全局 `AppHeader`：桌面显示当前空间，移动端品牌 + 菜单；搜索/通知统一收进顶栏；删除右下角浮动簇与抽屉里的重复 CommandPalette。
- 新增 `PageHeader`：收藏/最近/标签、回收站、分享、设置、平台、设计系统页统一「20px 标题 + 说明 + 动作槽」；AppHeader 不再重复页面标题。
- 文件页：面包屑 + 工具条移到列表卡片上方；**「上传」成为唯一主按钮**，新建文件夹/上传文件夹降为次要，视图切换右侧分段。

**列表与交互：**

- 去斑马纹；选中态 = accent tint + 左侧 2px 指示线；行 hover 更轻。
- 桌面行内操作 hover/focus 淡入（`.row-actions`），触屏常显；网格卡片 hover 轻抬升。
- 详情栏改用 `Surface`；EmptyState 图标收进圆底、标题 h2、说明限宽；Dialog 增加显式关闭按钮；Button/IconButton 去掉常驻阴影、统一 8px 圆角。

### 19.3 验证

- 对比度闸门（5 变体 × 18 组）持续通过；新令牌 `ink-3` 为满足 AA 调至 `#5b6577`（slate `#566474`）。
- 客户端 **43 文件 / 249 例**通过；双 `tsc`、`eslint`、`vite build` 全绿。
- 文档：[design-system.md](docs/design-system.md) 升级为 v7，新增「AppHeader/PageHeader/页面契约」与 v7 记录。

### 19.4 视觉复核与修正（已做）

用 headless Chrome + mock API 对 1440×900 与 390×844 实际截图复核（截图：[files-desktop.png](docs/design/v7/files-desktop.png)、[files-mobile.png](docs/design/v7/files-mobile.png)），发现并修复：

- 移动端表头未隐藏：表头的 `gridStyle` 带 inline `display:grid`，覆盖了 `hidden sm:grid`；改为外层隐藏、内层网格。
- 移动端文件名被截成 4 个字：行内 6 个操作图标占 156px；手机上收进「更多」菜单，文件名吃满宽度。
- 表头对齐：名称左对齐、大小/时间/操作右对齐；面包屑根「全部文件」升级为页面锚点。
- 首次见面配色：默认皮肤从 slate（青）改为 paper（靛蓝中性），与 v7 方向一致。
- 设置页限制 `max-w-3xl`；桌面行操作仅在真桌面 hover 设备淡出。
- 复核指标：390/1440 视口 `scrollWidth === viewportWidth`，无横向溢出、无裁切。

### 19.5 第二轮视觉复核（网格 / 暗色 / 标签 / 平台）

- **网格视图**：卡片被 CSS Grid 行拉伸成 300px 高、内容只占一半；`content-start + auto-rows-max` 后按内容高度排列。
- **标签页**：选中标签后标签 pills 消失（列表查询与标签列表混用一个 query）；拆成两个查询后始终保留切换入口。
- **暗色 / 平台 / 标签页**实际截图复核：无横向溢出，暗色与亮色共用同一层级；截图基线加入 `docs/design/v7/`。

### 19.6 标签色板与浮层位置

- 标签写接口服务端已支持 `color`，前端补齐 6 色色板：LibraryPage 新建表单、TagDialog「创建并添加」均可选色；标签 pills 与 TagDialog 列表显示色点（无颜色回退中性灰）。
- Toast 从 `top-4` 移到 `top-16`，避免 PWA 更新提示遮挡 AppHeader 的菜单/搜索/通知。
- 标签页截图更新为带色点版本（`docs/design/v7/tags-desktop.png`）。

### 19.7 表格节奏统一 + 视觉烟雾闸门

- 分享页补表头（名称/分享信息/操作），审计、用户管理表头统一 `2xs uppercase`，行高统一 `py-2.5`，让文件页/平台/分享三类表格节奏一致。
- 审计动作标签补齐 upload / share.create / auth.login 等，避免直接显示 action key。
- 新增 `npm run visual:check`（`scripts/visual-check.mjs`）：Node 静态服务器 + mock API + 本机 Chrome headless/CDP，覆盖 10 个页面与 1440/390 视口，自动断言标记与横向溢出；本轮运行 **10/10 通过**。

### 19.8 标签颜色编辑与空态收口

- 服务端新增 `PATCH /api/library/tags/:tagId`（name/color，color null 清除；非法色 400、跨租户 404），客户端新增 `updateTag`；LibraryPage 选中标签后可直接改色，pills 色点即时刷新。
- 分享页空态放进 `GlassCard`，与收藏/最近/标签/回收站保持同一空态结构。
- 服务端本地 shim 增至 29 项并覆盖改色 200/400/404；客户端 **250 例**通过；visual:check 10/10。

### 19.9 标签重命名

- 服务端 PATCH /api/library/tags/:tagId 已支持 name；本轮补 UI：选中标签 →「重命名」Dialog → 保存，复用同一 mutation 与重名/长度错误提示。
- 客户端新增重命名用例；标签页截图刷新（改色 + 重命名入口）。
- 当前闸门：客户端 251 例、server 本地 29 项、visual:check 10/10。

### 19.10 下一步视觉细化

- 网格卡片与文件类型图标再收敛一轮（缩略图比例、角标位置）。
- 设置页/平台表格的表头、行高、弹窗密度统一到 v7 节奏。
- 接入 Playwright 三断点视觉回归，给 v7 建立截图基线。

## 20. 后续建议（本次未实施）

1. `<AsyncState>`/`<PageState>` 统一加载/失败/空三态，修复收藏/最近/标签/回收站/分享/审计页「失败伪装成空」。
2. `<SelectionBar>` 统一 BatchBar / TrashPage / SharesPage 的批量条；`<SearchInput>`、`<ListSkeleton>`、`<PageShell>` 抽公共件。
3. queryKey 工厂 + 上传结束时批量失效一次 `["files"]`（当前逐文件失效，N 文件 × D 目录会放大请求）。
4. 上传队列 context 拆 state/actions（Browser 只订阅 `add`），消除上传时整页重渲染。
5. ConflictDialog / PreviewModal / NotificationBell 浮层统一到 `ui/Dialog`，补齐焦点陷阱与 `aria-modal`。
6. 过滤条件进 URL（可刷新/可后退）并把名称过滤上提到页面，保证「已选集合 = 可见集合」。
7. 服务端契约对齐：`AdminUser` 角色字段、`quota_bytes` 可空、search cursor、`recordView`、分享返回剔除 `password_hash`。
8. PWA `onNeedRefresh` 提示与 theme-color 统一（`/design` 已按需加载）。
9. 目录选择器若要在数千目录下进一步提速，可新增一次性目录树接口（服务端已具备物化路径，可用范围查询返回子树）。
