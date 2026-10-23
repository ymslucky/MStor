# MStor 设计系统 v8（权威版）· Quiet Workspace

> **令牌唯一来源**：`client/src/index.css` 的 `@theme`（含暗色覆盖）。
> **原语唯一来源**：`client/src/components/ui/*`；页面骨架 `components/layout/PageHeader` + `shell/AppHeader`。
> **可视化验收**：应用内 `/design` 页（`pages/DesignPage.tsx`）——新增令牌/原语**必须先在此登记**。
> **v7 实机基线**：`docs/design/v7/` 下 `files-desktop` / `files-mobile`（1440×900 / 390×844）、`grid-desktop`、`dark-desktop`、`tags-desktop`、`platform-users`、`platform-audit`、`shares-desktop`、`settings-desktop`、`trash-desktop`、`grid-mobile`、`palette`、`palette-mobile`、`notifications`、`share-dialog`、`create-dialog`、`batch-bar`、`preview`、`settings-members`、`create-mobile`、`list-selected`、`grid-selected`（共 22 张）。
> **设计意图来源**：根目录 DESIGN.md（OpenDesign 9 段 schema 的 MStor 版本）。
> 类名合并统一走 `client/src/lib/cn.ts`（clsx + tailwind-merge）。

## 0. v8 校准：向 OpenDesign 的设计系统学习

OpenDesign 的 152 个品牌设计系统把「令牌」和「意图」放在同一份 DESIGN.md 里：Color、Typography、Spacing、Layout、Components、Motion、Voice、Brand、Anti-patterns。其 Stripe / Linear / Vercel 对照实验说明：仅靠 tokens 会收敛成通用 SaaS，真正决定辨识度的是 prose 约束与 anti-patterns。

v8 借鉴并落地：

- **Stripe 的 restrained tech-editorial**：单一强调色只做 punctuation（主按钮/选中/焦点/链接），导航选中改为中性底 + 2px accent rail，不再整块 accent tint。
- **Linear 的 engineering-first minimal**：内容卡片取消投影，只用 1px 发丝边；card 圆角收紧到 8；删除 hover 位移/缩放、按钮 active 缩放，过渡只改颜色。
- **Vercel 的高对比排版**：启用 Inter optical sizing；标题用 text-wrap: balance；数字统一 tabular；正文不低于 12px。
- **Anti-patterns 变成规则**：写进根目录 DESIGN.md，禁止渐变/光晕/玻璃模糊、内容卡片投影、hover translate/scale、bouncy easing、裸调色板、绝对定位嵌套下拉。
- 视觉基线保持 22 张；visual:check 屏蔽 service worker，避免 PWA toast 污染截图。
- 新增 design-guard 测试扫描 UI 源码，禁止 hover 位移/缩放、active 缩放、玻璃模糊、spring、渐变背景回潮。

### v8.4 操作入口常显

- 关键动作直接展示：列表/网格均为「下载 + 分享 + 更多」，文件夹为「分享 + 更多」。
- 次要动作折叠进「更多」：收藏、打开、重命名、移动、复制、复制链接、标签、删除、详情；菜单含下载/分享作为键盘可达兜底。
- 右键菜单与「更多」共用 useNodeActions，行为不分叉；更多按钮 coarse 指针 44px。
- 工具条/命令面板/侧栏评分与改进项见 docs/component-ux-audit.md。

### v8.6 长页面滚动与审计表

- AppShell 主内容区统一 overflow-y-auto + overscroll-contain，StatusBar 始终是 flex 兄弟，不覆盖内容。
- 审计页/审计表使用 md:flex + min-h-0 + flex-1 + overflow-auto；20 行时表格内部滚动。
- sticky 表头必须写在 th 上（sticky + bg-bg-sub + z-sticky），表格用 border-separate；只在 thead 上放背景会在 border-collapse 下透出数据行。
- 视觉 mock 审计数据从 3 行增至 20 行，覆盖“数据变多才溢出”的回归。
- 补 invitation.create / revoke / accept 中文动作标签。

### v8.5 框选选择

- FileList 支持空白区域鼠标框选：固定定位矩形、命中 data-node-id 行/卡片、替换选择；Shift/Ctrl/Cmd 追加。
- 只在粗指针为 false 且起点不在行/按钮/输入框/表头时启动，避免与行拖拽移动、触屏滚动冲突。
- 单击空白（未拖动）清空选择；框选覆盖列表、虚拟列表与网格三种渲染路径。
- 新增 FileList 框选用例；客户端 269 例。

### v8.3 视频缩略图与预览

- 上传后统一在队列侧补缩略图：小文件、大文件分片、秒传三条路径都覆盖；图片与视频由客户端 Canvas 生成 WebP。
- 视频抽帧：加载 metadata 后 seek 到中间帧（短视频 0.1s），Canvas 输出 256px WebP；源文件上限 300MB、抽帧超时 8s，失败静默。
- 网格：有服务端缩略图用图；没有则用 muted/metadata 视频首帧并叠加播放角标；加载失败回退类型图标。
- 预览：有缩略图作为 poster；preload=metadata、playsInline；加载态与「编码不支持，请下载」错误态。
- 服务端无需转码：继续复用 /api/files/:id/thumb 的 image/* 上传与 R2 immutable 缓存。

### v8.1 / v8.2 选中态系统（黑白高对比）

- 采用 Vercel 式黑白选中，不使用 accent tint：列表选中行 ink 5% tint + 3px ink rail；网格选中卡 ink 边框 + ring；checkbox 使用 accent-ink。
- hover 不再把选中色覆盖成灰色；表头全选在部分选中时显示 indeterminate。
- 键盘：焦点在列表/网格/行首 checkbox 上时，Esc 均可清空选择。
- 新增 list-selected / grid-selected 视觉基线，共 22 张。

## 1. 方向：从「演示型玻璃拟态」到「安静、内容优先的工作台」

v6 的问题：彩色光晕 + 多层玻璃 + 高光让界面偏演示稿；亮色靛蓝 / 暗色薄荷青两套强调色；桌面无顶栏、搜索与通知漂在右下角；页面标题有的有、有的没有；列表常驻 6 个行内图标、斑马纹与悬浮卡片叠加，噪声高于信息。

v7 的取舍：

| 原则 | 落地 |
|---|---|
| 安静 | 单一中性冷灰底（`#f5f6f8`），**取消彩色光晕/渐变/高光**；表面为实色 + 1px 发丝边；只有弹窗/菜单用第二级阴影 |
| 一致 | 全站唯一靛蓝强调色（亮 `#4f46e5` / 暗 `#818cf8`）；状态色只表达状态；文件类型 chip 低饱和 |
| 内容优先 | 全局 `AppHeader`（桌面=当前空间，移动=品牌+菜单，搜索/通知统一在顶栏）+ 每页 `PageHeader`（20px 标题 + 说明 + 动作槽）；取消右下角浮动簇 |
| 克制层级 | 行高 44（紧凑 38）、字号基准 14、圆角 6/8/10/12、阴影两级；列表去斑马纹，选中用 accent tint + 左侧 2px 指示线 |
| 渐进呈现 | 桌面行内操作 hover/focus 淡入（`.row-actions`），触屏常显；工具栏把「上传」设为唯一主按钮，新建/文件夹上传降级 |
| 可验证 | 令牌对比度由 `test/contrast.test.ts` 对 5 变体 × 18 组强制 ≥4.5:1；reduced-motion 全局降级 |

## 2. 令牌

| 类别 | 值 |
|---|---|
| 表面 | `bg #f5f6f8` → `surface-1 #ffffff` → `surface-2 #ffffff`；`bg-sub #eef0f3`（暗色 `#0b0f16 / #11161f / #171e29 / #141a23`） |
| 文字 | `ink #101828` / `ink-2 #475467` / `ink-3 #5b6577`（暗色 `#f2f4f7 / #b6c0cc / #8b97a6`；全部 ≥4.5:1） |
| 描边 | `line #e4e7ec` / `line-strong #cfd4dc` |
| 强调 | `primary #4f46e5` / `primary-text #4338ca` / `primary-soft #eef2ff`（暗色 `#818cf8 / #a5b4fc / 16% tint`） |
| 状态 | 成功 `#067647/#05603a/#ecfdf3`、警告 `#b54708/#93370d/#fffaeb`、危险 `#b42318/#912018/#fef3f2` |
| 圆角 | `chip 6` / `btn,input 8` / `card 8` / `panel 12` |
| 阴影 | 内容卡片只用边框；浮层用 `card`（一级）/ `lift`（弹窗）；禁用彩色投影 |
| 字号 | 2xs 11 / xs 12 / sm 13 / base 14 / lg 16 / xl 20 / 2xl 24 |
| 动效 | `--ease-out-soft` + `duration-fast 120` / `slow 180` / `320→240`；`prefers-reduced-motion` 全归零 |

暗色：中性深灰（非蓝黑），强调色与亮色同色相（靛蓝），不使用玻璃模糊。

## 3. 原语与迁移状态

| 原语 | 实现 | 状态 |
|---|---|---|
| `Dialog` | **Radix Dialog**（焦点陷阱/Esc/遮罩/aria-modal/滚动锁定/焦点还原） | ✅ 已迁移 |
| `ConfirmDialog` | 复用 `Dialog` | ✅ 继承 |
| `ContextMenu` | 自研 + **键盘可达**（↑↓/Home/End、Esc 关闭并还原焦点、open 时聚焦首项、glass 面板） | 🟡 无障碍已补齐，未迁 Radix |
| `Toaster` | **Radix Toast**（Provider/Viewport；队列仍在 `useSyncExternalStore` 外部 store，`toast()` 签名不变） | ✅ 已迁移（滑动关闭、时长暂停、关闭按钮） |
| `ConflictDialog` | 复用 `Dialog`（Radix 焦点陷阱/Esc/焦点还原） | ✅ 已迁移 |
| `UndoSnackbar` / `PullToRefreshIndicator` / `BatchBar` / `BatchProgress` | 自研，遵循本页契约 | ✅ |
| `Button` / `Pill` / `IconButton` | 自研 + `cn`（`Badge` 已合并进 `Pill` 并删除） | ✅ |
| `RowAction` | 列表行内 28px 图标按钮（`components/RowAction.tsx`，语义令牌着色） | ✅ 新增 |
| `Input` | 自研 + `cn` | ✅ |
| `GlassCard` | 历史玻璃卡（`.glass sheen`）；新代码优先 `Surface` | ✅ |
| `Surface` | 卡片/面板唯一出处（描边+圆角+投影） | ✅ 新增 |
| `Pill` | 胶囊标签唯一出处（替代手写 rounded-full bg-*-soft） | ✅ 新增 |
| 状态反馈 | `.state-layer`（hover 6% / press 12%，与底色无关）；Button / IconButton / ListRow / NavItem 已采用 | ✅ |
| 皮肤 | **paper（默认）** / slate / ink / brutal，只覆盖 L1 + 形态令牌 | ✅ |
| 密度 | comfortable（行高 48）/ compact（40），行高由 --density-row-h 驱动 | ✅ |
| `Skeleton` | 自研 | ✅ |
| `ListSkeleton` | 统一列表加载占位（rows × 整行，aria-busy） | ✅ 新增 |
| `SearchInput` | 放大镜搜索输入（aria-label + 统一内边距） | ✅ 新增（components/SearchInput.tsx） |
| `SelectionBar` | 批量浮条唯一出处（已选 N 项 + 动作 + 取消，`.dock-bottom`） | ✅ 新增 |
| `AsyncState` | 查询三态壳（骨架/内联错误/缓存降级/禁用查询不骨架） | ✅ 新增（components/AsyncState.tsx） |
| `TagDialog` | 节点标签弹窗（基于 Dialog；勾选打/解、新建并添加） | ✅ 新增 |
| `Panel` | 浮层容器（level=e2 glass / e3 glass-strong），唯一出处 | ✅ 新增 |
| `Field` | label + 控件 + hint/error（自动 id 与 aria-describedby、error 用 role=alert） | ✅ 新增 |
| `NavItem` | 导航项，选中 accent-tint，行高走 --density-row-h | ✅ 新增 |
| `ListRow` | 列表行，高度走密度令牌，hover=E1 / 选中=accent-tint | ✅ 新增 |

迁移原则：**契约不变、视觉不变**，只换底座（无障碍与交互正确性），调用点尽量零改动；每迁一个原语必须跑 `tsc + eslint + 全量客户端用例 + build`。

## 4. 布局与导航

```
AppHeader（全端，h-14）：移动=菜单 + 品牌；桌面=当前空间 · MStor；右侧搜索(⌘K) · 通知 · 移动端退出
侧栏（md+，border-r，可折叠）：
  品牌 / 浏览（文件 收藏 最近 标签）/ 共享（分享 回收站）/ 平台（用户 审计）
  底部：空间切换 · 存储用量 · 账户行（设置/退出）
中部：PageHeader（标题 20px + 说明 + 动作槽）→ 页面内容
文件页：面包屑 → 工具条（筛选 chips 左 / 新建·上传·视图右）→ 列表卡片 → 右详情栏（xl+）
底部状态栏（md+，h-8）：空间 · 用量 · 队列 · 未读
移动抽屉（Radix Dialog）：导航分区 + 空间切换 + 存储用量 + 账户行
```

- **导航单一来源**：`shell/nav.ts` 的 `SECTIONS` 同时供桌面侧栏与移动抽屉（`shell/MobileNavDrawer.tsx`）使用。
- **搜索入口唯一**：`CommandPalette` 放在 `AppHeader`，移动端不再在抽屉里重复一个实例；⌘K 全局可用。
- **标题层级**：每个一级页面必须用 `PageHeader` 提供唯一 h1；AppHeader 不再重复页面标题（桌面显示空间名，移动显示品牌）。
- **文件页**：无 PageHeader，面包屑承担位置语义，DOM 保留 `sr-only h1`；路由切换同步 `document.title`。
- **顶部跳转**：`main#main-content` + 「跳到主要内容」skip link。

设置走子路由（`/settings/{account,upload,members}`），可深链、可后退；设置入口在侧栏底部头像行（齿轮），移动端抽屉底部也有一处。

**文件列表**：列定义/排序/列显隐/列宽收敛到 TanStack Table 列模型（`hooks/useFileTable.ts`），表头与行共用同一份 grid 模板；虚拟化仍是 `@tanstack/react-virtual`（行高由 `--density-row-h` 驱动，默认 44 / 紧凑 38）。行无斑马纹，选中 = accent tint + 左侧 2px 指示线；桌面行内操作 hover/focus 淡入（`.row-actions`），触屏常显。

**网格视图**：与列表共用同一份行契约（`data-file-row`、右键、长按多选、拖拽移动）；额外差异——名称过滤条固定在卡片区上方、选中态用 `border-primary + ring`（卡片自带 `bg-surface-1`，背景 tint 会被 CSS 顺序覆盖）、操作组浮在卡片右上（桌面 hover/focus 出现、触屏常显）、键盘 ↑↓ 按实际列数跨行移动（`useKeyboardNav` 读取容器的 `grid-template-columns`）。

**移动端**：导航为左侧 Radix 抽屉（非底部 Tab，含焦点陷阱/Esc/焦点还原）；**coarse 指针下单击=打开、长按 500ms=多选**（桌面保持单击选中、双击打开）；下拉 70px 松手刷新当前目录。

## 4.5 无障碍与视觉闸门

- `client/src/test/a11y.test.tsx` 是**入口闸门**：原语、Dialog、ConflictDialog / BatchBar / UndoSnackbar、StatusBar、移动导航抽屉（Radix）必须无 axe 违规。新增浮层或原语时在这里补一条用例，否则视为未登记。
- matcher 类型声明在 `client/src/test/vitest-axe.d.ts`（vitest-axe 0.1.0 未自带 augmentation）。
- 视觉回归（Playwright 三断点快照）尚未接入，是下一阶段目标。

## 5. 组件契约（新增组件必须遵守）

1. 颜色只用语义令牌（`bg-surface-1` / `text-ink-2` / `border-line` …），**禁止** `bg-gray-100`、`text-blue-600` 这类调色板直写。
2. 圆角只用四档，阴影只用四级。
3. 交互元素必须有可见焦点（不覆盖全局 `:focus-visible`）与 ≥44px 触控区（`.tap` 在 coarse 指针下生效）。
4. 动画只用 `--ease-spring` + 三档时长，且必须被 `prefers-reduced-motion` 覆盖。
5. 类名拼接一律 `cn()`，不手写三元字符串。
6. **禁止 `bg-white` 与调色板直写**（`bg-blue-50` / `accent-emerald-600`…）：用 `bg-surface-1/2`、`accent-primary` 等语义令牌，否则暗色与 `data-skin` 皮肤会失效。
7. 交互阈值/断点集中在 `client/src/lib/constants.ts`（虚拟阈值、长按、下载间隔、撤销时长、断点），不要在组件里写裸数字。
8. 新增原语先在 `/design` 登记用例，再接入业务组件。
9. 一级页面必须使用 `PageHeader`（唯一 h1 + 选项说明 + 动作槽）；全局 chrome 只允许来自 `AppHeader` / 侧栏 / 状态栏，页面内不再自建顶栏或浮动搜索/通知。

## 6. 历史（避免重走弯路）

| 版本 | 方向 | 结果 |
|---|---|---|
| v3 | 奶白 + 彩色光斑 + 玻璃三档 | 被否（糖果感、层次靠糊） |
| v4 | 中性极简（Linear 风） | 被否（太素） |
| v5 | 工业终端 / 磁带未来主义 / 新野兽派 | 被否（终端质感过重） |
| **v6** | **明亮清新 + 真毛玻璃 + 活泼动效** | 现行 |

## 7. v6.1 重构记录（契约不变）

- 令牌：`ink-3` 提对比度（`#6b665f` / slate `#66737f` / 暗色 `#8b9cae`）；`--radius-chip` 对齐 8；`.glass-strong` 背景改用 `color-mix(--color-surface-2)`，皮肤/暗色不再强制白玻璃；删除重复的 `.state-layer` 块。
- 配色：8 处调色板直写、15 处 `bg-white` 改语义令牌；`:focus-visible` 去掉 `border-radius` 并改用主色令牌。
- 原语：`Badge` 合并进 `Pill`；`Field` 用 `cloneElement` 注入 id/aria；新增 `RowAction`；删除 `BrowserKpi`/`StorageRing`。
- 布局：移动抽屉改 Radix Dialog 并复用导航数据源、补搜索/空间/用量/账户；详情栏内联断点 `lg → xl`；`.pb-nav → .pb-safe`；skip link + `document.title` + 文件页 `sr-only h1`。
- 数据：`ApiError.path` 区分公开分享接口的 401；Toaster 上移全局；撤销状态 `{id, kind}`；冲突策略下沉 `lib/conflict`；`lib/constants.ts` 集中阈值。
- 闸门：`tsc` / `eslint` / 207 例客户端测试 / `vite build` 全绿；新增移动抽屉 axe 用例与上传进度回归用例。

### v6.2 第二轮：网格视图与查询三态

- 网格视图：名称过滤条恢复；选中态改描边+ring；卡片右上操作组；长按多选/右键/拖拽与列表共用 `cellHandlers`；键盘 ↑↓ 按列数跨行、Home/End；卡片内不再产生额外 Tab 停靠点。
- 新增 `AsyncState`（pending/error/retry/ready 统一壳）与 `ListSkeleton`，收藏/最近/标签/回收站/分享/审计/用户管理页的「失败被当成空」修复；`friendlyMessage` 接入业务。
- 新增 `SelectionBar`：文件页 BatchBar / 回收站 / 分享页共用同一批量浮条。
- 新增 `lib/queryKeys.ts`：所有 queryKey 收敛到工厂（修复 `members` 键漂移、收藏/最近跨页缓存共享）；上传完成改为 400ms 合并失效（N×D → 1 次量级）。
- `AsyncState`：错误但仍有缓存数据时只显示顶部内联错误条（不丢弃缓存）；网格卡操作组在 `@media (hover: none)` 下常显（`.grid-card-actions`）。

### v6.3 第三轮：浮层 a11y、目录选择器、按需加载

- `ConflictDialog` 迁移到 `ui/Dialog`（Radix）：焦点陷阱/Esc/遮罩/焦点还原全部继承，删除手写 `role=dialog` 外壳。
- 通知面板：打开后焦点移入、Esc 关闭并把焦点还给铃铛（点外部关闭不抢焦点）。
- `MoveDialog` 重写：BFS 逐层并发（每层 6 路）替代串行 N+1；加载失败显示可重试错误态（不再永远「加载中」）；关闭后丢弃结果；目标目录改为 `aria-pressed` 按钮组并显示当前选择。
- `EmptyState` 标题降为 `h2`（各页 h1 之下不再跳级）；新增 `SearchInput` 统一 3 处搜索框。
- `/design` 与 `/platform/*` 改为 `React.lazy` + `Suspense`：首屏主包 664→651.6 kB（gzip 211→208.3 kB），管理页独立 chunk。
  Suspense 位于 AppShell 的 `main` 内（包 `Outlet`，且在页面级 ErrorBoundary 之下）：懒加载不卸载外壳/上传队列，chunk 失败由页面级兜底接住。
- 闸门：`tsc` / `eslint` / **37 文件 229 例** / `vite build` 全绿。

### v6.4 第四轮：上传队列订阅与体验

- `UploadQueueProvider` 拆 State（items）/ Actions 两个 context：页面只订阅稳定的 actions，上传进度不再整页重渲染；Provider 必需（缺失抛错），删除隐藏的兜底第二队列。
- 通知角标初始值取 `/api/me.unreadNotifications`（`NotificationBell.initialUnread`）；收藏/取消收藏改乐观更新（失败回滚）。
- 上传分片并发封顶 `MAX_PART_CONCURRENCY = 4`（队列并发 N 时峰值 N×4 而非 N²）。
- 闸门：`tsc` / `eslint` / **38 文件 233 例** / `vite build` 全绿。

### v6.5 后续批次（标签 / 搜索分页 / 清理）

- 标签写接口 UI：TagDialog、LibraryPage 新建/删除标签、Browser 右键「标签…」与 DetailPane 入口；服务端新增 `GET /api/library/node-tags/:nodeId`。
- 命令面板接入 `nextCursor` 游标分页（`useInfiniteQuery` + 「加载更多结果」）。
- 删除 `clearFinished` 死代码；底部浮层统一 `.dock-bottom`；`/design` 登记 SearchInput/AsyncState/SelectionBar/TagDialog。
- 闸门：**42 文件 245 例**；双 `tsc` / `eslint` / `vite build` 全绿。

### v6.6 对比度闸门

- 新增 `client/src/test/contrast.test.ts`：解析 `@theme`/暗色/skin 令牌（含 var 链与半透明合成），断言 5 个变体 × 18 组文字/背景 ≥4.5:1。
- 修正：亮色 `chip-amber-fg #b45309→#a64a06`；brutal `ink-tertiary #6d6d6d→#626262`。
- 闸门：**43 文件 250 例**；双 `tsc` / `eslint` / `vite build` 全绿。

### v6.7 目录树与回归

- 移动/复制目标选择改 `GET /api/dirs/tree` 一次性建树（5000 上限 + truncated 提示），移除逐层 N+1。
- 闸门：**43 文件 249 例**；server 本地 29 项；双 `tsc` / `eslint` / `vite build` 全绿。

### v7.0 Calm Workspace（本轮）

- 从玻璃拟态转向安静工作台：中性画布、实色表面、单一靛蓝强调色、两级阴影、14px 基准、44px 行高。
- 新增 `AppHeader`（统一搜索/通知/空间上下文）与 `PageHeader`（统一页面标题与动作）；删除桌面右下浮动簇与抽屉重复搜索。
- 文件页工具条上移并建立主操作（上传）；列表去斑马纹、行操作渐进呈现；详情栏 EmptyState Dialog 等原语同步收紧。
- 闸门：对比度 5 变体通过；**43 文件 249 例**；双 `tsc` / `eslint` / `vite build` 全绿。

### v7.1 视觉验收与移动端修正

- **默认皮肤改为 paper**（中性靛蓝）；slate / ink / brutal 保留为备选，不再作为首次见面。
- **表头**：名称左对齐、大小/时间/操作右对齐；移动端隐藏表头（此前 `gridStyle` 的 inline `display:grid` 覆盖了 `hidden sm:grid`）。
- **移动行**：行操作在手机收进「更多」菜单，把宽度让给文件名（此前 6 个图标占 156px，文件名只剩 4 个字）；窄屏不显示 `上传文件夹` 图标。
- **桌面行操作**：仅在 `min-width:768px` 且 `hover:hover` 时默认淡出，避免在触屏/分屏下不可见。
- **面包屑**：根级「全部文件」升级为 16px 半粗页面锚点，根级时带 `aria-current`。
- **设置页**：内容宽度限制在 `max-w-3xl`，表单不再横跨 1200px。
- 视觉复核：headless Chrome + mock API 对 1440×900 / 390×844 / 设置页截图检查，无横向溢出、无裁切。

### v7.2 网格与标签页修正

- **网格卡片**：`FileGrid` 加 `content-start auto-rows-max`，卡片按内容高度排列，不再被 grid 拉伸成带大片空白的 300px 高卡片。
- **标签页**：标签列表改为独立查询；选中某标签后仍保留「全部标签 / 各标签」pills，可直接切换（此前选中即失去标签导航）。发布/删除后同时失效标签列表与标签节点。
- 补充 `grid-desktop` / `dark-desktop` / `tags-desktop` / `platform-users` 截图基线；暗色与亮色共用同一套层级与强调色。

### v7.3 标签色板与浮层位置

- 新增 `lib/tagColors.ts`（6 色）；LibraryPage 新建标签与 TagDialog 新建并添加均可选颜色，标签 pills/列表行显示色点。
- Toast viewport 从 `top-4` 移到 `top-16`：提示不再遮挡 AppHeader 的菜单/搜索/通知。
- 网格卡片 footer 内边距微调；标签页截图基线更新为带色点版本。

### v7.4 表格节奏与视觉烟雾闸门

- 表格统一：表头 `text-2xs uppercase tracking-wide text-ink-3`；行 `py-2.5`、分隔线、hover 用 `bg-bg-sub/70`；分享页补「名称 / 分享信息 / 操作」表头。
- 审计动作补齐常见标签（上传、创建分享、登录、重命名、移动），避免裸 action key。
- 新增 `scripts/visual-check.mjs` + `npm run visual:check`：自起静态服务器 + mock API + headless Chrome/CDP，覆盖 1440/390、暗色、桌面/移动网格、设置、标签、平台、回收站、分享共 11 个页面/视口；断言核心标记存在且 `scrollWidth <= viewportWidth`，截图输出到 `.tmp-build/visual`。前置 `npm run build`，可用 `CHROME_BIN` 指定浏览器。

### v7.5 标签颜色编辑

- 新增 `PATCH /api/library/tags/:tagId`：可更新 `name` / `color`（`color: null` 清除），服务端校验 `#hex` 并对跨空间 id 返回 404。
- LibraryPage 选中标签后出现「颜色」选择器，改色即时写入并刷新 pills/色点；新建与编辑共用同一色板。
- 服务端本地 shim 覆盖改色 200、非法色 400、跨租户 404；客户端覆盖改色 mutation。
- 分享空态收进 `GlassCard`，与其他列表页空态结构一致。

### v7.6 标签重命名

- 标签页选中标签后新增「重命名」入口，用 `Dialog` 承载名称表单；保存调用 PATCH /api/library/tags/:tagId 的 name 字段。
- 与服务端已有的重名 409、长度 1–32 校验共用同一条错误路径；成功后失效标签列表/节点查询。
- 客户端用例增至 251；标签页截图更新。

### v7.7 分享筛选与详情预览

- 分享页新增「全部 / 有效 / 过期 / 用尽」筛选（带数量），切换筛选时清空选择，避免批量撤销误伤隐藏项；筛选无结果时提供「清除筛选」空态。
- 详情栏对图片增加 4:3 预览（走缩略图地址，失败时由原图/浏览器兜底），让右栏不再只有元信息。
- 视觉闸门 mock 增加分享数据，并断言筛选组存在。

### v7.8 批量标签

- 文件页选中多项后，批量条新增「标签」；`BatchTagDialog` 单选一个标签后追加到全部选中节点，已打过的由服务端 `INSERT OR IGNORE` 幂等去重。
- 成功后清空选择并失效标签列表 / 各节点标签查询；不做批量移除（移除交给单节点 TagDialog 回显现状）。
- 新增组件用例；客户端用例 253。

### v7.9 网格卡片收尾

- 缩略图区从固定 `h-28` 改为 `aspect-[4/3]`：不同断点下保持统一图片比例，照片/图标卡不再忽高忽低。
- 图片 hover 轻微 `scale(1.03)`（320ms 缓动），卡片抬升与图片缩放叠加但幅度克制。
- 卡片名称加原生 `title`，长文件名在截断后仍可悬停查看。

### v7.10 像素基线对比

- `visual:check` 支持 `--baseline`：在页面 canvas 中逐像素比较当前截图与 `docs/design/v7/*.png`，默认差异阈值 1.5%（`VISUAL_DIFF_MAX` 可覆盖），同时校验尺寸；失败退出码 1。
- 支持 `--update-baseline`：有意改版后重写基线；mock 时间固定为 UTC 2026-10-22 10:00，保证同机同浏览器下可复现。
- 当前 11 个页面/视口在基线对比下均为 `diff 0.00%`。

### v7.11 缩略图、拖拽与邀请复制

- 网格卡片：图标从灰底直接摆放改为白色圆角 tile + 文件类型角标（文件夹不重复角标）；缩略图加载失败回退到类型图标；新增 390×844 网格基线。
- 拖拽：内部节点拖拽不再触发上传覆盖层/上传队列；拖回当前目录直接 no-op，不再产生移动撤销条。
- 邀请：创建/重新生成后自动尝试写入剪贴板，并在成员面板展示只读链接 + 复制按钮；复制失败提示手动复制。

### v7.12 浮层视觉覆盖与命令面板

- `visual:check` 新增 8 个浮层/页面基线：命令面板、通知面板、分享弹窗、新建文件夹、批量条、预览层、成员设置、移动端新建文件夹；随后补 palette-mobile，当前 **20/20** 通过且像素差异 0.00%。
- 命令面板打开即展示最近访问（不再依赖输入框 focus 是否成功）；空态按钮修正为“回到根目录”。
- 命令面板「新建文件夹」改为通过 /?newFolder=1 跳转并自动打开创建弹窗，不再只是回到文件页。

### v7.13 命令面板重构

- 移除「标题栏 + 输入框 + 绝对定位下拉」的三层嵌套，改为单一纵向面板：输入行 → 排序/类型分段 → 结果滚动区 → 键盘提示。
- 桌面宽面板 sm:max-w-2xl，高度按内容自适应、上限 70vh；移动端为底部抽屉（上限 86dvh），不再是 cramped 的居中弹窗。
- 排序/类型从原生下拉改为分段控件；结果行统一图标 + 名称 + 路径；最近访问/操作分组、命中高亮保留。
- 顶部搜索按钮仍是入口；Esc/点击遮罩/关闭按钮均可关闭。
- 视觉基线新增 palette-mobile，共 20 张。
