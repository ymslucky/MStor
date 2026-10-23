---
version: 1.0
name: MStor Quiet Workspace
source: OpenDesign 9-section DESIGN.md schema
primary: '#4f46e5'
surface: '#ffffff'
canvas: '#f5f6f8'
ink: '#101828'
line: '#e4e7ec'
radius-card: 8
radius-panel: 12
space-base: 4
---

# MStor DESIGN.md

> 借鉴 OpenDesign 的 9 段 schema（Color / Typography / Spacing / Layout / Components / Motion / Voice / Brand / Anti-patterns）。
> 本文是 UI 的唯一设计意图来源；令牌仍以 client/src/index.css 为唯一实现来源。

## 1. Color

语义角色优先于色值。主强调色只有一个：靛蓝 #4f46e5（暗色 #818cf8）。
表面：canvas #f5f6f8，card #ffffff，sunken #eef0f3；暗色 #0b0f16 / #11161f / #141a23。
文字：ink #101828，ink-2 #475467，ink-3 #5b6577；线 #e4e7ec / #cfd4dc。
状态色只表达状态：成功 #067647，警告 #b54708，危险 #b42318。

对比约束：
- 正文与次要在 canvas / card 上至少 4.5:1；ink-3 是辅助信息下限，不再更浅。
- 白字只在 primary / danger 等实色按钮上使用，避免灰字叠色。
- 暗色不得使用纯黑背景，也不得用彩色发光替代层级。

Accent 允许出现的位置：
1. 主操作按钮（上传、创建、保存）；
2. 当前选中的筛选 chips；
3. 表格/列表的选中指示；
4. 焦点环；
5. 链接与 active tab。
导航选中态使用中性底色 + 2px accent rail，不用整块 accent tint。

## 2. Typography

UI 字族 Inter Variable，品牌字族 Plus Jakarta Sans 仅用于品牌词。
正文 14px / 1.5，辅助 13px，说明 12px，最小 11px（仅角标/键盘提示）。
页面标题 20px semibold，弹窗标题 16px semibold；不使用 24px 以上的页面标题。
数字（大小、时间、计数、配额）一律 tabular-nums。
启用 font-optical-sizing: auto；长标题使用 text-wrap: balance。
中英文混排不做首行缩进，不强制两端对齐。

## 3. Spacing

base 4px；常用 4 / 8 / 12 / 16 / 24 / 32 / 48。
页面水平内边距：移动 16，平板 24，桌面 32。
卡片内边距 16；列表行高由密度令牌控制（舒适 44 / 紧凑 38）。
不在同一个容器里混用 10 / 14 / 18 这类非 4 倍数间距。

## 4. Layout

桌面：侧栏 240px（可折叠 64px）+ 主内容；主内容不强制最大宽度，文件表格吃满。
设置页/表单最大 768px；命令面板最大 672px。
窄屏：侧栏收进抽屉；顶部 AppHeader 常驻；表格隐藏非关键列。
层级：内容 → sticky → 导航 → 遮罩 → 弹窗 → 菜单 → toast；不使用裸 z-index。
主内容区是唯一页面滚动容器，StatusBar 不覆盖内容；长表格自身滚动并保持 sticky 表头。

## 5. Components

Button：高度 32 / 36，圆角 8，1px 边；hover 只改背景色，不位移、不缩放、不加投影。
Card：1px 发丝边 + 圆角 8；内容卡片无投影；只有浮层使用 lift。
Input：高度 36，1px 边，焦点时 border 变 accent，不加外发光。
Selection：黑白高对比，不使用 accent tint。列表选中行 ink 5% tint + 3px ink rail；网格选中卡 ink 边框 + ring；checkbox 使用 accent-ink；表头部分选中显示 indeterminate；Esc 清空选择，不依赖焦点在行上。空白区域可拖拽框选（Shift/Ctrl 追加，鼠标专属）。
Actions：关键动作直接展示——文件「下载 + 分享」、文件夹「分享」；次要动作折叠进「更多」。列表/网格、桌面/移动一致；禁止把核心动作只藏在 hover 里。
Table：表头 11px 大写弱化色；行高 44；行 hover 只改背景。
Dialog：桌面居中圆角 12，移动端底部抽屉；遮罩不使用重模糊。
Command palette：单纵向面板；输入 → 分段筛选 → 结果滚动 → 键盘提示；禁止输入框下再套绝对定位下拉。
Photo thumbnail：4:3；文件类型角标固定左下；加载失败回退类型图标。视频也用抽帧缩略图；无缩略图时用 muted/metadata 首帧 + 播放角标，预览必须 poster + playsInline + 错误回退。

## 6. Motion

只使用颜色/透明度/轻微位移；120ms hover，180ms 状态，240ms 浮层。
不使用 spring、bounce、elastic；不使用 hover translate/scale；按钮按下不缩放。
prefers-reduced-motion 下所有动画归零。

## 7. Voice

克制、具体、可执行；优先动词，不用营销形容词。
中文文案以“操作 + 对象 + 结果”为主：上传文件、移动到…、已还原 2 项。
不使用“强大、极致、丝滑、颠覆、AI 驱动”等词；不在按钮里使用感叹号或 emoji。
错误文案说明原因与下一步，不责备用户。

## 8. Brand

MStor 是私有家庭云盘：可信、安静、可恢复。
Logo：云图标 + MStor 字标；不拉伸、不加投影、不放在彩色渐变上。
品牌色靛蓝只作为 punctuation；背景保持中性，让文件内容成为主角。
空态、加载、错误都要保持同一语气：简短、明确、不卖萌。

## 9. Anti-patterns

- 彩色光晕、渐变背景、玻璃模糊、扫光 sheen。
- 内容卡片投影；用边框表达层级。
- hover translate/scale、active scale、bouncy easing。
- 第二个强调色；用 accent 铺满导航或整页。
- 圆角超过 12px（除头像/胶囊）。
- 原始调色板类（bg-blue-500、text-gray-600）；必须用语义令牌。
- 原生 select 作为主要筛选控件（用分段控件）。
- 绝对定位的下拉浮层嵌套在弹窗输入框下。
- 11px 以下正文；emoji 当图标或 CTA。
- 正文出现“AI 驱动/一键智能/赋能”等空话。
