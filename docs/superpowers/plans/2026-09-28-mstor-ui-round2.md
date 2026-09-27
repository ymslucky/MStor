# MStor UI 第二轮优化（批量管理 / 视图切换 / 交互细节）

> 承接 2026-09-28-mstor-ui-redesign.md（浅色仪表盘已上线）。本轮为功能与交互增强，设计语言不变（浅色 + 白卡 + emerald 主色）。

## Batch 1: 全宽布局 + 退出确认弹窗

- **全宽**：移除内容区 max-w-5xl 约束（AppShell 内容容器改 `px-4 sm:px-6` 不限宽；1024px+ 大屏铺满）。侧边栏 w-60 不变。
- **ConfirmDialog 组件**（`components/ui/ConfirmDialog.tsx`，基于既有 Dialog 外壳）：
  ```tsx
  interface ConfirmDialogProps { open: boolean; title: string; description?: string;
    confirmText?: string; cancelText?: string; danger?: boolean; busy?: boolean;
    onConfirm: () => void; onCancel: () => void; }
  // 确认按钮 danger 时用 Button danger，否则 primary；Esc/取消关闭
  ```
- **退出登录改造**（AppShell）：点退出 IconButton → 打开 ConfirmDialog（title「退出登录」description「确定要退出当前账号吗？」confirmText「退出」danger）→ 确认执行 clearSessionFlag() + `window.location.href = "/auth/logout"`；取消仅关弹窗。
- 同步把 FileList 删除、Trash 彻底删除、Shares 撤销的 `window.confirm` 全部替换为 ConfirmDialog（交互统一）。
- 测试：既有 window.confirm 相关 spy 断言改为断言弹窗出现与确认点击。commit: `feat(ui): confirm dialogs and fluid width layout`

## Batch 2: 批量管理 + 列表/网格视图

- **选择状态**：Browser 持有 `selected: Set<string>`；FileList 增 props `selectable?: boolean; selected: Set<string>; onToggle(id)`。行首 checkbox（点击 checkbox 不触发行打开）；表头全选（当前页全选/清除）。选中 ≥1 时 Browser 底部浮出**批量操作条**（fixed bottom-20 sm:bottom-6 居中白卡 shadow）：「已选 N 项 | 下载 | 移动 | 删除 | 取消」。
  - 批量删除：ConfirmDialog → 逐个 `deleteNode(id)`（顺序执行）→ invalidate files+trash。
  - 批量移动：打开 MoveDialog → 确认后逐个 `moveNode`。
  - 批量下载：仅文件，逐个以 300ms 间隔触发 `content?dl=1`（避免浏览器拦截）。
- **视图切换**：工具栏右侧分段控件（列表 ⇆ 网格，两个 IconButton，激活态 accent-soft）；偏好存 `localStorage("mstor_view")`，初始读缺省 "list"。
- **网格视图**（同一数据）：`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3`；卡片：缩略区 h-28（图片文件直接 `<img src=contentUrl loading="lazy" class="object-cover">`，非图片显示大号类型图标 chip），下方文件名 truncate + 大小；选择 checkbox 左上角浮层；点击行为与列表一致；右键/操作同列表。
- 测试：新增选择/全选/批量删除调用、视图切换类名断言；既有断言语义不变。commit: `feat(files): batch management and list/grid view toggle`

## Batch 3: 拖拽上传 + 右键菜单 + 面包屑/空状态

- **拖拽上传**：Browser 内容区 `onDragOver(preventDefault)+onDrop`；dragenter 显示全屏覆盖层（虚线圆角框 + 「松开，上传到当前目录」）；drop 的 `e.dataTransfer.files` 进既有 `queue.add(files, dir)`；含目录条目时忽略并 toast「文件夹暂不支持，请压缩后上传」。离开窗口/落点外关闭覆盖层（dragleave 计数法防闪烁）。
- **右键菜单**：`components/ContextMenu.tsx`——`fixed z-50 白卡 shadow-card rounded-xl py-1`，项：图标+文字（打开/下载/分享/重命名/移动/删除；目录无下载），danger 项红字；`onContextMenu` 在行/网格卡片打开于指针处（防溢出屏幕翻转），点击他处/Esc/滚动关闭。移动端无右键，沿用行内按钮。
- **面包屑**：样式升级（根「全部文件」+ chevron 分隔 ›，当前级 font-medium text-ink）；超过 4 级折叠为「…」点击弹出层级列表（MVP 可先直接平铺，家庭层级浅）。
- **空状态**：EmptyState CTA 化——空目录提供「上传文件」「新建文件夹」两个按钮；明确区分「目录为空」与「加载失败/搜索无结果」。
- 测试：拖拽（dataTransfer 模拟 drop 调用 queue.add）、ContextMenu 打开/关闭/动作分发；commit: `feat(files): drag-drop upload, context menu, breadcrumb and empty states`

## 约束（同前轮）
aria-label 与文案语义保留；API 零改动；每批次独立 commit；验收 = test:client 全绿 + check 零错误 + build 成功。
