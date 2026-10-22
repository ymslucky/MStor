# MStor 设计系统 v6（权威版）

> **令牌唯一来源**：`client/src/index.css` 的 `@theme`（含暗色覆盖）。
> **原语唯一来源**：`client/src/components/ui/*`（7 个）。
> **可视化验收**：应用内 `/design` 页（`pages/DesignPage.tsx`）——新增令牌/原语**必须先在此登记**。
> 类名合并统一走 `client/src/lib/cn.ts`（clsx + tailwind-merge）。

## 1. 方向：明亮清新 + 真毛玻璃 + 活泼动效

| 原则 | 落地 |
|---|---|
| 通透 | 近白微冷底 + 三处极淡色彩光晕（薄荷/天蓝/淡紫）；常规面板 `.glass` = 实色 + 发丝边（滚动稳定），浮层/弹窗 `.glass-strong` 才是真毛玻璃（`backdrop-filter: blur(28px) saturate(190%)` + 顶部高光） |
| 清新 | 唯一强调色靛蓝 `#4c5bd4`（slate 皮肤青 `#0f766e` / ink 琥珀 `#e8a33d` / brutal 蓝 `#2563eb`）；功能色明亮但不刺眼（绿 `#10b981` / 琥珀 `#f59e0b` / 玫红 `#f43f5e`），只用于状态 |
| 有生气 | spring 曲线 `cubic-bezier(0.34,1.4,0.64,1)`，160/240/320ms；按钮 hover 抬升 2px、按下缩放 0.98；卡片 `.hover-lift`；进场 `.anim-item-in`；弹窗 `.anim-pop`；骨架流光 |
| 无障碍 | `prefers-reduced-motion` 动效归零；`prefers-reduced-transparency` 玻璃退化实色；焦点环统一 2px 主色 + 2px 偏移 |

## 2. 令牌

| 类别 | 值 |
|---|---|
| 表面 | `bg #fbfbfa` → `surface-1 #ffffff` → `surface-2 #ffffff`；`bg-sub #f4f4f2`（暗色由 media query 覆盖） |
| 文字 | `ink #1c1b19` / `ink-2 #57534e` / `ink-3 #6b665f`（canvas 5.5:1；slate `#5f6c78`、暗色 `#8b9cae`、ink 皮肤 `#87919b` 均 ≥4.5:1） |
| 描边 | `line #e2e9f0` / `line-strong #cdd8e3` |
| 强调 | `primary #4c5bd4` / `primary-text #3a47ae` / `primary-soft #eef0fb`（暗色 `#2dd4bf` 系为高对比变体） |
| 状态 | `success` / `warn` / `danger` 各带 `-text`、`-soft` |
| 圆角 | `chip 8` / `btn,input 8` / `card 12` / `panel 16` |
| 阴影 | `soft` / `card` / `lift` / `glass`（四级柔和扩散，禁用硬投影） |
| 字号 | 2xs 11 / xs 12 / sm 13 / base 15 / lg 18 / xl 22 / 2xl 30 |
| 动效 | `--ease-spring` + `duration-fast 160` / `slow 240` / `320` |

暗色：`#0e1620` 深蓝灰 + 同款光晕，玻璃转 `rgb(255 255 255 / 0.07–0.1)`。

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
| 皮肤 | paper / **slate（默认）** / ink / **brutal（新粗野主义）**，只覆盖 L1 + 形态令牌 | ✅ |
| 密度 | comfortable（行高 48）/ compact（40），行高由 --density-row-h 驱动 | ✅ |
| `Skeleton` | 自研 | ✅ |
| `ListSkeleton` | 统一列表加载占位（rows × 整行，aria-busy） | ✅ 新增 |
| `SearchInput` | 放大镜搜索输入（aria-label + 统一内边距） | ✅ 新增（components/SearchInput.tsx） |
| `Panel` | 浮层容器（level=e2 glass / e3 glass-strong），唯一出处 | ✅ 新增 |
| `Field` | label + 控件 + hint/error（自动 id 与 aria-describedby、error 用 role=alert） | ✅ 新增 |
| `NavItem` | 导航项，选中 accent-tint，行高走 --density-row-h | ✅ 新增 |
| `ListRow` | 列表行，高度走密度令牌，hover=E1 / 选中=accent-tint | ✅ 新增 |

迁移原则：**契约不变、视觉不变**，只换底座（无障碍与交互正确性），调用点尽量零改动；每迁一个原语必须跑 `tsc + eslint + 全量客户端用例 + build`。

## 4. 布局与导航

```
顶栏（glass-light，仅移动端）：汉堡 · 页名 · 通知 · 退出
侧栏（glass，可折叠，分区；md+）：
  浏览 → 文件 / 收藏 / 最近 / 标签
  共享 → 分享 / 回收站
  平台 → 用户管理 / 日志审计（仅管理员）
中部：路径栏 · 工具条 · 文件列表（玻璃卡片；表头固定 + 内部单一滚动容器）
右详情栏（glass，xl+ 内联）：详情 / 预览 / 动作；更窄回落 NodeDetailDialog
底部状态栏（glass-subtle，md+）：空间 · 用量 · 队列 · 未读
移动抽屉（Radix Dialog）：导航分区 + 搜索 + 空间切换 + 存储用量 + 账户行
```

- **导航单一来源**：`shell/nav.ts` 的 `SECTIONS` 同时供桌面侧栏与移动抽屉（`shell/MobileNavDrawer.tsx`）使用；`NAV` 扁平导出已删除。
- **移动端搜索入口**：抽屉底部复用 `CommandPalette`；桌面仍是右下浮动簇。
- **文件页标题**：视觉标题由移动端 TopBar 承担，DOM 中保留 `sr-only h1`；路由切换同步 `document.title`。
- **顶部跳转**：`main#main-content` + 「跳到主要内容」skip link。

设置走子路由（`/settings/{account,upload,members}`），可深链、可后退；设置入口在侧栏底部头像行（齿轮），移动端抽屉底部也有一处。

**文件列表**：列定义/排序/列显隐/列宽收敛到 TanStack Table 列模型（`hooks/useFileTable.ts`），表头与行共用同一份 grid 模板；虚拟化仍是 `@tanstack/react-virtual`（固定行高 48，动态测量未做）。

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
