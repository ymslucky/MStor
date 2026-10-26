version: 4.0
name: MStor Atelier Studio
source: Impeccable replacement visual world
primary: '#bc4b18'
surface: '#ffffff'
canvas: '#f7f5f2'
ink: '#1d1b18'
line: '#e3ded6'
radius-card: 16
radius-panel: 20
space-base: 4
---

# MStor DESIGN.md

## Concept

**Atelier Studio**：MStor 是一间私人的资料工作室。界面以暖瓷白画布、深炭墨和陶土主色构成，像一个被整理得很好的作品库：不追求仪表盘的紧张感，也不模仿档案室的纸本，而是让照片、文档和目录以充足留白与清晰层级呈现。

## Color

默认皮肤为 `atelier`（历史存储值 `paper` 映射到它）：

- Canvas `#f7f5f2`：暖瓷白工作画布。
- Raised `#ffffff` / Overlay `#ffffff`：作品与表层的清晰载体。
- Sidebar `#f0ede8` / Sunken `#ebe7e0`：资料馆索引与填充。
- Ink `#1d1b18` / `#55524b` / `#6b675f`。
- Line `#e3ded6` / `#cfc7ba`。
- Accent `#bc4b18`，hover `#9c3c13`，text `#9c3c13`，tint `#fff0e9`。
- Positive `#20713d`，Caution `#99650d`，Critical `#b3291f`。状态色只表达状态。

暗色为夜晚工作室：Canvas `#151412`，Raised `#1e1c19`，Sunken `#282521`，Ink `#f6f3ef`，Accent `#f19a72`。不得使用纯黑、蓝紫控制台色或彩色光晕。

Accent 只用于主操作、当前导航/筛选、选中指示、焦点环和链接。导航当前项为陶土浅底与深陶土文字，不用大面积实色。

## Typography

UI 使用 Inter Variable；品牌词与页面标题使用 Plus Jakarta Sans。正文 14px / 1.5，辅助 13px，说明 12px，表头 11px 大写。页面标题 20px semibold，弹窗 16px semibold。大小、时间、配额、计数使用 tabular-nums。中文文案采用“对象 + 状态 / 动作 + 结果”，语气冷静、具体、有人味但不营销。

## Spacing

4px 基准，常用 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40。页面水平内边距移动 16、平板 24、桌面 32。卡片 16，控制舱 16，列表舒适 44 / 紧凑 38。留白用于区分作品与工具，不用空白制造迟疑。

## Layout

桌面是「资料馆索引 + 工作室画布」：

- 左侧 264px 侧栏：品牌、当前空间、分组导航、容量卡与账户，底色比画布更深半层。
- 顶部 64px 工作室栏：当前语境、全局搜索、通知；移动端承接菜单与退出。
- 文件页第一层是作品控制舱：路径与对象统计在上，筛选/新建/上传/视图切换在下。
- 主内容为白色圆角表面，吃满剩余宽度；长表格内部滚动。
- 设置与长表单最大 768px；窄屏侧栏收进抽屉，控制舱自动折行。

主内容是唯一页面滚动容器。层级保持 content → sticky → nav → overlay → modal → menu → toast，不使用裸 z-index。

## Components

- Button：高 32/36，圆角 10；主操作陶土实色，次操作白面描边，危险操作浅红底深红字。
- NavItem：44px 高、圆角 10；当前项 accent tint，hover 只变底色。
- Surface / GlassCard：白色表面、1px 暖灰描边、圆角 16；浮层圆角 20，投影向下且柔和。
- Input：高 36，白底 1px 边，焦点 2px 陶土描边。
- Filter pill：独立圆角胶囊，当前项 accent tint；禁止把筛选做成彩色标签墙。
- Selection：列表选中 ink 6% + 3px ink rail；网格选中 ink 边 + ring。
- Table：表头 11px 大写，sticky 属性写在 `th`，行 hover 只变背景。
- Empty state：居中或左对齐都说明下一步，不只宣告空。
- 浏览器表面：选区、光标、滚动条、链接下划线全部取语义令牌。

## Motion

120ms hover、180ms 状态、240ms 浮层；仅颜色、透明度和 2px 内轻微位移。无 spring/bounce/hover scale。`prefers-reduced-motion` 时全部归零。

## Voice

像一位细心的私人资料助理：安静、具体、可靠。标题描述对象，空态给出下一步，分享与删除明确边界、期限和不可恢复范围。

## Brand

MStor 标记为 34px 陶土圆角方块与白色云形；品牌词使用 display 字体。装饰限于纸张、画布、索引和圆润浮层，不使用地球、锁、火箭、家庭照片或仪表盘灯效。

## Anti-patterns

- 深色命令轨、电紫信号色、仪表盘紧张感；这是上一版被替换的世界。
- 温绿档案纸和登记线；同样是过期世界。
- 消费级玻璃拟态、渐变文本、彩色光晕、装饰性模糊。
- 全宽 hero、无信息 kicker、同尺寸卡片墙。
- 核心上传/下载/分享动作只依赖 hover。
- 只用颜色表达状态，或让批量操作条遮挡内容。
