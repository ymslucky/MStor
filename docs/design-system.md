# MStor 设计系统 v6（权威版）

> **令牌唯一来源**：`client/src/index.css` 的 `@theme`（含暗色覆盖）。
> **原语唯一来源**：`client/src/components/ui/*`（7 个）。
> **可视化验收**：应用内 `/design` 页（`pages/DesignPage.tsx`）——新增令牌/原语**必须先在此登记**。
> 类名合并统一走 `client/src/lib/cn.ts`（clsx + tailwind-merge）。

## 1. 方向：明亮清新 + 真毛玻璃 + 活泼动效

| 原则 | 落地 |
|---|---|
| 通透 | 近白微冷底 + 三处极淡色彩光晕（薄荷/天蓝/淡紫）；面板为真毛玻璃（半透明白 + `backdrop-filter: blur(20–28px) saturate(180–190%)` + 顶部 1px 高光） |
| 清新 | 唯一强调色薄荷青 `#0ea5a4`；功能色明亮但不刺眼（绿 `#10b981` / 琥珀 `#f59e0b` / 玫红 `#f43f5e`），只用于状态 |
| 有生气 | spring 曲线 `cubic-bezier(0.34,1.4,0.64,1)`，160/240/320ms；按钮 hover 抬升 2px、按下缩放 0.98；卡片 `.hover-lift`；进场 `.anim-item-in`；弹窗 `.anim-pop`；骨架流光 |
| 无障碍 | `prefers-reduced-motion` 动效归零；`prefers-reduced-transparency` 玻璃退化实色；焦点环统一 2px 主色 + 2px 偏移 |

## 2. 令牌

| 类别 | 值 |
|---|---|
| 表面 | `bg #f6f8fb` → `surface-1 #ffffff` → `surface-2 #ffffff`；`bg-sub #eef2f7` |
| 文字 | `ink #10202c` / `ink-2 #4a5b68` / `ink-3 #8296a3`（≥4.5:1） |
| 描边 | `line #e2e9f0` / `line-strong #cdd8e3` |
| 强调 | `primary #0ea5a4` / `primary-text #0b7f7e` / `primary-soft #d9f4f3` |
| 状态 | `success` / `warn` / `danger` 各带 `-text`、`-soft` |
| 圆角 | `chip 8` / `btn,input 12` / `card 16` / `panel 20` |
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
| `ConflictDialog` / `UndoSnackbar` / `PullToRefreshIndicator` / `BatchBar` / `BatchProgress` | 自研，遵循本页契约 | ✅ |
| `Button` / `Badge` / `IconButton` | 自研 + `cn` | ✅ |
| `Input` | 自研 + `cn` | ✅ |
| `GlassCard` / `Skeleton` | 自研 | ✅ |

迁移原则：**契约不变、视觉不变**，只换底座（无障碍与交互正确性），调用点尽量零改动；每迁一个原语必须跑 `tsc + eslint + 190 用例 + build`。

## 4. 布局与导航

```
顶栏（glass-light）：汉堡(移动) · 页名 · 通知 · 搜索 · 退出
侧栏（glass，可折叠，分区）：
  浏览 → 文件 / 收藏 / 最近 / 标签
  共享 → 分享 / 回收站
  系统 → 设置
中部：路径栏 · 工具条 · 文件列表（玻璃卡片，行 hover 抬升）
右详情栏（glass，桌面 lg+）：详情 / 预览 / 动作；窄屏回落 NodeDetailDialog
底部状态栏（glass-subtle）：空间 · 用量 · 队列 · 未读
```

设置走子路由（`/settings/{account,upload,members,admin}`），可深链、可后退；设置入口在侧栏底部头像行（齿轮），移动端抽屉底部也有一处。

**文件列表**：列定义/排序/列显隐/列宽收敛到 TanStack Table 列模型（`hooks/useFileTable.ts`），表头与行共用同一份 grid 模板；虚拟化仍是 `@tanstack/react-virtual`（固定行高 48，动态测量未做）。

**移动端**：导航为左侧抽屉（非底部 Tab）、长按 500ms 进入多选、下拉 70px 松手刷新当前目录。

## 5. 组件契约（新增组件必须遵守）

1. 颜色只用语义令牌（`bg-surface-1` / `text-ink-2` / `border-line` …），**禁止** `bg-gray-100`、`text-blue-600` 这类调色板直写。
2. 圆角只用四档，阴影只用四级。
3. 交互元素必须有可见焦点（不覆盖全局 `:focus-visible`）与 ≥44px 触控区（`.tap` 在 coarse 指针下生效）。
4. 动画只用 `--ease-spring` + 三档时长，且必须被 `prefers-reduced-motion` 覆盖。
5. 类名拼接一律 `cn()`，不手写三元字符串。
6. 新增原语先在 `/design` 登记用例，再接入业务组件。

## 6. 历史（避免重走弯路）

| 版本 | 方向 | 结果 |
|---|---|---|
| v3 | 奶白 + 彩色光斑 + 玻璃三档 | 被否（糖果感、层次靠糊） |
| v4 | 中性极简（Linear 风） | 被否（太素） |
| v5 | 工业终端 / 磁带未来主义 / 新野兽派 | 被否（终端质感过重） |
| **v6** | **明亮清新 + 真毛玻璃 + 活泼动效** | 现行 |
