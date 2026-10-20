# MStor 设计系统 v6 · 明亮清新 + 玻璃质感 + 活泼动效

> v4（中性极简）与 v5（工业终端/磁带未来主义）均被否。定稿方向：**明亮、清新、通透，毛玻璃与动效作为主要表达**。
> 代码真相：`client/src/index.css`（令牌）+ `client/src/components/ui/*`（原语）。

## 1. 三条构成法则

1. **通透**：底色不是纯白，而是近白微冷 + 三处极淡色彩光晕（薄荷 / 天蓝 / 淡紫）；面板是真毛玻璃（半透明白 + `backdrop-filter: blur(20–28px) saturate(180%)` + 顶部 1px 高光描边）。
2. **清新**：强调色为薄荷青 `#0ea5a4`，功能色用明亮却不刺眼的绿/琥珀/玫红；彩色只出现在状态与强调，不铺大面积。
3. **有生气**：所有可交互元素 hover 抬升 2px、按下缩放 0.98；进场用 spring 曲线（10px 位移 + 0.99 缩放），时长 160/240/320ms；骨架用流光而不是灰块。

## 2. 令牌

| 类别 | 亮（清新） | 暗（深蓝灰玻璃） |
|---|---|---|
| `bg` | `#f6f8fb` + 三色光晕 | `#0e1620` + 同款光晕 |
| `surface-1/2` | `#ffffff` | `#16202b` / `#1b2632` |
| `ink / -2 / -3` | `#10202c / #4a5b68 / #8296a3` | 反转提亮 |
| `line / -strong` | `#e2e9f0 / #cdd8e3` | `#24313d / #334455` |
| `primary(-text/-soft)` | `#0ea5a4 / #0b7f7e / #d9f4f3` | `#2dd4bf / #5eead4` |
| `success / warn / danger` | `#10b981 / #f59e0b / #f43f5e`（各带 -soft） | 提亮版 |
| 圆角 | chip 8 / btn 12 / input 12 / card 16 / panel 20 | 同 |
| 阴影 | soft / card / lift / glass 四级**柔和扩散**（不用硬投影） | 加深 |
| 动效 | `--ease-spring` + 160/240/320ms | 同 |

玻璃档位：`.glass`（卡片 66% 白 + blur20）、`.glass-strong / .glass-modal`（80% + blur28）、`.glass-panel`（顶栏 72% + blur24）、`.glass-subtle`（42% + blur12）。`prefers-reduced-transparency` 下自动退化实色。

## 3. 原语

| 原语 | 表现 |
|---|---|
| `Button` | 主按钮实色薄荷 + 柔和投影；hover 抬升、active 缩放 0.98；ghost 为 70% 白 + blur |
| `Input` | 70% 白 + blur，hover 边框加深，focus 主色边框 |
| `Badge` | 胶囊、浅底深字 |
| `GlassCard` | `.glass + .sheen`（顶部高光） |
| `IconButton` | 圆形，hover 白色柔光 + 抬升 |
| `Skeleton` | 玻璃底 + 流光 + `animate-pulse`（保留加载态可识别性） |

## 4. 布局目标（三栏，进行中）

```
顶栏（glass-panel）：空间切换 · ⌘K 搜索 · 上传 · 通知 · 账户
左导航（glass，圆角浮起）：空间 / 收藏 / 最近 / 标签 / 回收站 / 分享
中部：路径栏 · 工具条 · 文件列表（玻璃卡片，行 hover 抬升）
右详情（glass，可收起）：详情 / 预览 / 标签 / 分享
底部状态栏（glass-subtle）：空间 · 用量 · 队列 · 未读
```

## 5. 待办

1. 三栏骨架（AppShell 重写）+ 右详情栏
2. 设置页拆路由（账户/空间/成员/存储/管理）
3. 分享管理（剩余次数、过期状态、最近下载）
4. 上传与批量（全局队列面板、冲突与续传可视化、批量操作条）
5. 移动端（抽屉、下拉刷新、长按多选）
