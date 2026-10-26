# Product

<!-- impeccable:product-schema v1 -->

## Purpose

MStor 是部署在 Cloudflare 上的私有家庭云盘。它把分散在个人设备里的照片、文档、视频和家庭资料收拢为一个可长期维护、可检索、可受控分享的家庭档案库。

## Users

- **家庭资料管理者**：整理照片、证件扫描、视频和长期资料，需要在桌面与移动端完成上传、归档、检索和备份。
- **管理员**：审批家庭成员、维护配额和平台安全状态；日常同样以文件任务为主。

## Jobs

1. 浏览、定位和预览个人工作区中的文件与目录。
2. 从浏览器批量上传、整理、标记、收藏和恢复资料。
3. 生成有期限、有次数限制的公开分享，并随时撤销。
4. 管理存储用量、上传队列和平台审计。

## Meaningful difference

每个 approved 用户拥有一个以 `workspace_id` 隔离的私有工作区；D1 保存结构化元数据，R2 保存对象，Cloudflare Access 控制准入。它不是通用网盘或团队空间，而是家庭私有档案系统。

## Platform

- Web app；核心场景为桌面浏览器操作，移动浏览器可用。
- React 19 + Vite + Tailwind 4；服务端 Cloudflare Workers + Hono。
- 支持亮暗外观、舒适/紧凑密度、键盘导航和常见触屏操作。

## Accessibility

- 目标 WCAG AA：正文与辅助文字达到 4.5:1。
- 交互件具备可见焦点、键盘路径和 44px 触控目标。
- 动效尊重 `prefers-reduced-motion`，不使用纯颜色传达状态。

## Constraints

- 用户数据必须以 `workspace_id` 隔离；跨租户资源返回 404。
- R2 物理删除必须经过 `orphan_objects` 延迟复查。
- 权限、配额和审计真相在服务端；前端只做体验优化。
- 不支持通用 SaaS、团队共享空间、匿名上传、WebDAV / FTP / NAS 协议。

## Open decisions

- 是否为照片年代、地点等家庭档案维度增加专门浏览方式，尚未由产品决策确认。
