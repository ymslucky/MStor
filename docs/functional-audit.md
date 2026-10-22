# MStor 功能与操作体验验证（2026-10-22）

> 范围：客户端主要页面 + 服务端关键接口。方法：既有自动化用例、服务端本地 shim、headless Chrome 视觉/交互检查、代码走查；对发现的缺陷补回归用例。
> 结论：本轮定位并修复 11 个真实问题；核心页面在 1440/390 视口无横向溢出，自动化闸门全绿。真实 R2 上传、Cloudflare Access 登录、PWA 离线与跨浏览器下载仍需真机回归（见 §5）。

## 1. 验证结果

| 闸门 | 结果 |
|---|---|
| 客户端 Vitest | **43 文件 / 254 例通过** |
| 服务端本地 shim | **29 项通过** |
| 双 TypeScript | 通过 |
| ESLint | 通过 |
| vite build | 通过 |
| visual:check --baseline | **10/10 页面通过，像素差异 0.00%** |

## 2. 逐功能矩阵

| 功能 | 验证方式 | 结果 | 备注 |
|---|---|---|---|
| 文件列表 / 面包屑 / 排序 / 列显隐 | Browser 测试 + 截图 | 通过 | 移动端隐藏表头、名称吃满宽度 |
| 网格视图 / 选择 / 长按 / 键盘 | FileList 测试 + 截图 | 通过 | 4:3 缩略图；选中 border/ring |
| 新建文件夹 / 重命名 / 移动 / 复制 | Browser 测试 + 走查 | 通过 | 弹窗、目录树、撤销路径有覆盖 |
| 删除 / 回收站 / 批量删除 | Browser/Trash 测试 | 通过 | 软删与彻底删除分离 |
| 收藏 / 最近 | Browser + Library 测试 | 通过 | query 失效路径覆盖 |
| 标签：新建 / 改色 / 改名 / 删除 / 批量打 | Library/TagDialog/BatchTag 测试 + server shim | 通过 | 本轮补 PATCH 改色/改名 |
| 分享：创建 / 列表 / 筛选 / 撤销 | ShareDialog/Shares 测试 | 通过 | 筛选与全选联动 |
| 分享：公开访问 / 提取码 / 子目录 | SharePage 测试 + 走查 | 通过（已修） | 子目录 loading 曾闪“空文件夹” |
| 分享：下载 | 走查 | 通过（已修） | objectURL 回收过快 |
| 搜索 / 命令面板 / 分页 | SearchBox/CommandPalette 测试 | 通过（已修） | 空态按钮文案与行为不一致 |
| 通知 / 已读 | NotificationBell 测试 + server shim | 通过（已修） | 入群通知链接指向旧 query 参数 |
| 设置：账户 / 上传并发 | Settings 测试 | 通过 | 并发仅本地偏好 |
| 设置：成员 / 邀请 / 撤销邀请 / 角色 | server shim + 新增 MemberPanel 测试 | 通过（已修） | 邀请列表不回传 token，撤销曾必然 404 |
| 平台：用户 / 配额 / 停用 / 审计 | PlatformPage 测试 + server shim | 通过（已修） | 审计曾只回传 actorId，操作者为空 |
| 预览：图片 / 视频 / 音频 / PDF / 文本 | PreviewModal 测试 | 通过（已修） | 缺 dialog 语义、焦点与滚动锁 |
| 详情栏 / 移动端抽屉 / 触屏 | 测试 + 截图 | 通过 | — |
| 主题 / 皮肤 / 密度 / 对比度 | contrast + 截图 | 通过 | 5 变体 × 18 组 ≥4.5:1 |
| 上传（真实文件/分片/R2） | 单元测试 + 走查 | 待真机 | 需在真实 R2/Access 环境回归 |
| PWA / 离线 / 安装 | 走查 | 待真机 | registerType prompt；离线导航有测试 |

## 3. 本轮修复

| # | 严重度 | 问题 | 修复 |
|---|---|---|---|
| 1 | P1 | 邀请列表不回传 token，UI 用 email 调 token 撤销接口，撤销必然 404 | 服务端新增 DELETE /api/workspaces/invitations/by-email/:email；MemberPanel 改用邮箱撤销；补 server shim 与客户端用例 |
| 2 | P1 | 审计日志只有 actorId，表格操作者永远显示“—” | overview 查询 LEFT JOIN users 返回 actorName；客户端类型同步；补 shim 断言 |
| 3 | P2 | 分享子目录切换时先渲染“空文件夹”，随后才加载 | children.isPending 单独渲染“加载中…” |
| 4 | P2 | 分享下载立即 revokeObjectURL，部分浏览器会取消下载 | 延迟 1s 回收，并 append/remove 链接节点 |
| 5 | P2 | 提取码为空时点“解锁”query key 不变，不重新请求 | 增加 attempt nonce 进入 query key |
| 6 | P2 | 命令面板空态“新建文件夹”实际只回根目录 | 文案改为“回到根目录” |
| 7 | P2 | 预览层无 dialog 语义、焦点不进入、背景可滚动 | 增加 role/aria-modal/aria-label、焦点进入关闭按钮并归还、滚动锁 |
| 8 | P2 | 成员/邀请请求失败时静默显示为空 | 增加明确的加载失败提示 |
| 9 | P2 | 入群通知链接 /settings?tab=members 但设置页只认路径段，落到账户页 | 改为 /settings/members |
| 10 | P3 | 平台非管理员兜底页未使用 PageHeader | 统一标题区 |
| 11 | P3 | FileCard 外层与名称重复 title，测试/读屏出现重复名称 | 移除重复 title，保留卡片外层 |

## 4. 操作体验复核

- 移动端：文件页无横向溢出；表头隐藏、行操作收进“更多”；顶部搜索/通知可达。
- 模态与焦点：Dialog 基于 Radix；预览层补语义与焦点归还；Esc 关闭路径保留。
- 空态/加载/错误：AsyncState 覆盖列表页；成员/邀请补错误分支；分享子目录补 loading。
- 文案一致性：命令面板空态文案与实际行为对齐；审计动作补中文标签。

## 5. 仍需真机/真实环境

1. 真实 R2 上传：小文件直传、大文件分片、秒传、断点续传、冲突策略（尤其拖拽上传目前绕过同名冲突策略）。
2. Cloudflare Access 登录/邀请认领全链路。
3. PWA 安装、离线导航、更新提示在 iOS/Android 真机的表现。
4. 跨浏览器下载（Safari/Firefox 对 objectURL 与大文件 Range 的差异）。
5. 移动端长按/拖拽/下拉刷新在真实触屏设备的手感。
6. 邀请链接创建后 toast 只展示一次；如需再次获取需重新生成，可考虑补“重新生成链接”入口。

## 6. 复验命令

    npm run test:client
    npm run test:server:local
    npm run check
    npm run build && npm run visual:check -- --baseline
