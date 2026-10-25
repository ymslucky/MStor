# 决策记录

本文件采用轻量 ADR。每条决策必须包含背景、决策、后果和状态。被替代的决策保留并标记 `Superseded`。

## ADR-0001：产品收敛为个人云盘

状态：Accepted
日期：2026-10-23

### 背景

项目曾探索多成员 workspace、邀请和 SaaS 化。家庭场景对权限复杂度、运营成本和误配风险敏感。

### 决策

MStor 收敛为个人云盘：每个 approved 用户一个私有 workspace，只提供公开外链分享，不提供成员共享空间 UI。

### 后果

- schema 保留 workspace / membership 基础，但产品不暴露团队协作。
- 用户隔离成为第一安全不变量。
- 未来重启团队空间必须新增 ADR 并设计迁移。

## ADR-0002：Cloudflare-native 架构

状态：Accepted

### 决策

使用 Cloudflare Workers + D1 + R2 + Access，不自建服务器、数据库和对象存储。

### 后果

- 运维成本低，边缘访问近。
- 必须接受 Workers CPU、D1 容量 / rows read、R2 一致性与 Cloudflare 平台限制。
- 不拆微服务；保持模块化单体。

## ADR-0003：Cloudflare Access 作为认证边界

状态：Accepted

### 决策

不在应用内自建密码、session 或 OIDC；Access 负责登录，Worker 验签 JWT 并绑定 `access_sub`。

### 后果

- 认证面小，Access 策略是准入关键。
- `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` 配置漂移会导致登录失败。
- 公开分享必须通过显式 Bypass 应用，路径范围最小化。

## ADR-0004：文件树使用邻接表 + 物化路径

状态：Accepted

### 决策

`nodes` 使用 `parent_id` + `path`，不使用闭包表作为主存储。

### 后果

- 目录移动需要更新子树 path 前缀。
- 子树范围查询和批量删除可用索引区间扫描。
- 避免 closure table 写放大与 D1 容量压力。

## ADR-0005：配额真相在 `workspaces.used_bytes`

状态：Accepted

### 决策

配额判断以 `workspaces.used_bytes` 原子更新为准，`storage_stats` 仅作四分项解释统计，每日 cron 校准兜底。

### 后果

- 高频上传不需要全表 SUM。
- 业务写必须维护 used_bytes。
- 统计 bug 不能绕过配额真相。

## ADR-0006：R2 延迟物理删除

状态：Accepted

### 决策

彻底删除节点时先登记 `orphan_objects`，cron 延迟复查引用后物理删除 R2 key。

### 后果

- 降低秒传 / 并发引用造成对象误删的风险。
- 孤儿对象存在短期计费。
- 不允许绕过队列直接删除 R2。

## ADR-0007：分享下载使用会话直链与计数去重

状态：Accepted

### 决策

密码分享验证后签发短会话，允许浏览器原生直链下载；下载使用 dedupe key，Range / 预览不重复扣减次数。

### 后果

- 大文件避免 fetch + blob 全量载入。
- 需要保护会话 cookie、过期与撤销语义。
- 下载管理器多次 Range 请求不会耗尽次数。

## ADR-0008：只保留当前规范，历史文档不入仓库

状态：Accepted
日期：2026-10-25

### 背景

仓库曾积累大量日期式方案、过程报告和过期迁移说明，与当前实现冲突，导致事实来源不清。

### 决策

仓库只保留当前有效的 AGENTS / README / SPEC / ADR / DESIGN 与测试基线。历史计划与报告通过 Git 历史追溯，不再保留在工作树。

### 后果

- 文档维护成本降低，当前事实唯一。
- 历史上下文需要查 Git，不再在目录中直观可见。
- 新增过程性报告必须放入 issue / PR，不得提交仓库。
