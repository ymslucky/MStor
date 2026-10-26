version: 3.0
name: MStor Signal Desk
source: Impeccable replacement visual world
primary: '#5b46e5'
surface: '#ffffff'
canvas: '#f2f4f8'
ink: '#111422'
line: '#dce1eb'
radius-card: 12
radius-panel: 16
space-base: 4
---

# MStor DESIGN.md

## Concept

**Signal Desk**：MStor 是个人家庭云数据的操作台。视觉采用深色命令轨、瓷白工作面、电紫信号色和紧凑仪表语言；界面不模仿档案室，也不使用消费云盘的轻盈玻璃，而是强调路径清楚、状态醒目、批量操作顺手。

## Color

默认皮肤为 `signal`（历史存储值 `paper` 映射到它）：

- Canvas `#f2f4f8`：冷灰工作面。
- Raised `#ffffff` / Overlay `#ffffff`：内容与浮层。
- Sunken `#e6eaf1`：填充、分段控件和 hover。
- Command rail `#111422` / line `rgb(255 255 255 / 0.12)` / ink `#e9ecf5`。
- Ink `#111422` / `#4b5167` / `#5d6478`。
- Line `#dce1eb` / `#c2cad8`。
- Accent `#5b46e5`，hover `#4a37c8`，text `#4a37c8`，tint `#eeeaff`。
- Positive `#077256`，Caution `#a25a00`，Critical `#bb2d20`。状态色只表达状态。

暗色为夜间操作台：Canvas `#0b0f1a`，Raised `#121826`，Sunken `#182034`，Ink `#eef1f8`，Accent `#a9a3ff`。不得使用纯黑或无语义彩色光晕。

Accent 只用于主操作、当前导航/筛选、选中指示、焦点环和链接。导航当前项用 accent 12% 底 + 同色文字，不用大面积色块。

## Typography

UI 使用 Inter Variable；品牌词 MStor 使用 Plus Jakarta Sans。正文 14px / 1.5，辅助 13px，说明 12px，表头 11px 大写，命令轨标签 11px。页面标题 20px semibold，弹窗 16px semibold。大小、时间、配额、计数使用 tabular-nums。中文文案采用“动词 + 对象 + 结果”，避免情绪化形容。

## Spacing

4px 基准，常用 4 / 8 / 12 / 16 / 20 / 24 / 32。页面水平内边距移动 16、平板 24、桌面 32。控制舱内边距 12，卡片 16，列表舒适 44 / 紧凑 38。同容器不混用非 4 倍数间距。

## Layout

桌面是「命令轨 + 工作台」：

- 左侧固定 88px 命令轨：品牌、主导航图标 + 短标签、容量和账户。
- 顶部 64px 工作台栏：当前空间、产品语境、全局搜索和通知。
- 文件页第一层是控制舱：当前路径、对象统计、类型/时间分段筛选、新建与上传、视图切换集中在一个表面。
- 设置和长表单最大 768px；主内容吃满剩余宽度。
- 窄屏保留顶部栏和抽屉导航，控制舱折为两行，表格隐藏次要列。

主内容是唯一页面滚动容器；长表格内滚动并 sticky 表头。层级保持 content → sticky → nav → overlay → modal → menu → toast，不使用裸 z-index。

## Components

- Button：高 32/36，圆角 8；主操作电紫实色，次操作瓷白描边，危险操作浅红底深红字。
- Command rail item：56px 高，图标 + 11px 标签；当前项 accent 12% 底，hover 只改底色。
- Surface / GlassCard：内容表面 1px 冷灰描边、圆角 12；浮层圆角 16，投影向下偏移。
- Input：高 36，白底 1px 边，焦点为 2px 电紫描边。
- Filter segment：多个筛选共享一个描边容器，选中项白底 + accent 文字，不用独立彩色 chips。
- Selection：列表选中 ink 6% + 3px ink rail；网格选中 ink 边 + ring。
- Table：表头 11px 大写，sticky 属性写在 `th`，行 hover 只变背景。
- Empty state：左对齐，图标、标题、下一步和动作在一条可扫描的横向线上；不宣告“空”。
- 浏览器表面：选区、光标、滚动条、链接下划线全部取语义令牌。

## Motion

120ms hover、180ms 状态、240ms 浮层；仅颜色、透明度和 2px 内轻微位移。无 spring/bounce/hover scale。`prefers-reduced-motion` 时全部归零。

## Voice

像值班的家庭数据操作员：直接、准确、可执行。标题说明当前对象，控制项说明动作，空态说明下一步，危险动作说明范围和不可恢复性。

## Brand

MStor 品牌标记为命令轨顶部的 36px 电紫圆角方块与白色云形；品牌词使用 display 字族。装饰语言限于轨道、分段和信号，不使用地球、锁、火箭、家庭照片或云朵群。

## Anti-patterns

- 温纸、墨绿、档案室隐喻；这是上一版被替换的世界。
- 消费级玻璃拟态、渐变文本、彩色光晕和装饰性模糊。
- 全宽大标题 hero、无信息 kicker、相同尺寸卡片墙。
- 核心上传/下载/分享动作只依赖 hover。
- 只用颜色表达状态，或让批量操作条遮挡内容。
