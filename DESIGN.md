version: 2.0
name: MStor Home Archive
source: Impeccable replacement visual world
primary: '#166f52'
surface: '#fffdf8'
canvas: '#f3efe7'
ink: '#17211d'
line: '#ded5c5'
radius-card: 10
radius-panel: 14
space-base: 4
---

# MStor DESIGN.md

## Concept

**Home Archive**：MStor 是一间长期可靠的家庭档案室。界面使用温纸、墨绿和精确的登记线，而不是消费级云盘的蓝色玻璃。视觉上强调“资料已被收好、随时可取”：左侧是档案室索引，顶部是工作台，内容区是干净的登记纸。

## Color

语义色（默认 `paper` 皮肤）：

- Canvas `#f3efe7`：温纸工作台。
- Raised `#fffdf8` / Overlay `#fffdf9`：登记纸与浮层。
- Sunken `#e8e1d4`：档案索引和填充区。
- Ink `#17211d` / `#4b5148` / `#5f6660`。
- Line `#ded5c5` / `#c8bda9`。
- Accent `#166f52`，hover `#0f5740`，text `#12553f`，tint `#e4f1eb`。
- Positive `#076b48`，Caution `#a35707`，Critical `#b3261e`。状态色只表达状态。

暗色为深绿墨档案：Canvas `#101815`，Raised `#17211d`，Sunken `#1e2a25`，Ink `#edf2ee`，Accent `#74c9a9`。不得用纯黑或彩色光晕。

Accent 只用于主操作、当前导航/筛选、选中指示、焦点环和链接。导航选中用中性温纸底 + 左侧 3px 墨绿 rail。

## Typography

UI 使用 Inter Variable；品牌词 MStor 使用 Plus Jakarta Sans。正文 14px / 1.5，辅助 13px，说明 12px，表头 11px 大写。页面标题 20px semibold，弹窗 16px semibold。所有大小、时间、配额、计数使用 tabular-nums。中文操作文案采用“动词 + 对象 + 结果”，不用营销形容。

## Spacing

4px 基准，常用 4 / 8 / 12 / 16 / 24 / 32 / 48。页面水平内边距移动 16、平板 24、桌面 32。卡片 16，列表舒适 44 / 紧凑 38。同容器不混用非 4 倍数间距。

## Layout

桌面为「档案索引 + 工作台」：侧栏 248px（可折叠 64px），侧栏底色温纸且与内容区有 1px 登记线；主内容顶部为 56px工作台栏。设置和长表单最大 768px。窄屏侧栏收进抽屉，AppHeader 常驻，表格隐藏次要列。

主内容是唯一页面滚动容器；表格内滚动并 sticky 表头。层级保持 content → sticky → nav → overlay → modal → menu → toast，不使用裸 z-index。

## Components

- Button：高 32/36，圆角 9，主按钮墨绿实色，次按钮纸面描边；只做颜色反馈。
- Surface / GlassCard：内容表面 1px 温纸描边、圆角 10；浮层圆角 14，投影带向下偏移。
- Input：高 36，纸面底、1px 描边，焦点用 2px 墨绿描边。
- NavItem：档案索引行，选中为 sunken 底 + 左 rail；未选中 hover 只变底色。
- Selection：墨色高对比。列表选中 `ink 6%` + 3px ink rail；网格选中 ink 边 + ring。
- Table：表头 11px 大写，行 hover 只变背景；sticky 属性写在 `th`。
- Empty state：说明下一步操作，不只宣告空。
- 浏览器表面：选区、光标、滚动条、链接下划线均使用语义令牌。

## Motion

120ms hover、180ms 状态、240ms 浮层；仅颜色、透明度和 2px 内轻微位移。无 spring/bounce/hover scale。`prefers-reduced-motion` 时全部归零。

## Voice

像可靠的档案管理员：克制、具体、可执行。空态回答“现在可以做什么”，危险动作说明不可恢复的范围，上传/分享状态给出下一步。

## Brand

MStor 标记是 32px 墨绿圆角方块中的白色云形；品牌词使用 display 字族。不用地球、锁、无限符号或家用照片装饰。产品叙事统一为“家庭档案室 / 工作台 / 索引 / 登记”。

## Anti-patterns

- 蓝色消费云盘气质、玻璃拟态、彩色光晕、渐变文本。
- 装饰性投影、卡片嵌套、hover 位移/缩放。
- 只靠 hover 展示核心文件动作。
- 用颜色替代文字状态，或用彩色 chips 装饰非状态信息。
- 破坏工作区隔离、把分享误解为协作空间。
