# 架构规范

状态：Accepted
适用版本：当前 `master`

## 1. 系统拓扑

```text
React 19 / PWA
  ↓ HTTPS
Cloudflare Access
  ↓ JWT assertion
Cloudflare Worker
  ├── Hono middleware：认证、CSRF、用户、workspace、角色
  ├── Routes：HTTP 协议与请求校验
  ├── data/lib：文件树、上传、分享、回收站、审计等业务模块
  ├── D1：身份、元数据、配额、分享、审计、配置
  └── R2：文件对象、缩略图
```

静态资源由 Cloudflare Assets 承载，`/api/*` 优先进入 Worker。`workers_dev` 关闭，生产入口是自定义域。

## 2. 运行时约束

- Cloudflare Workers，开启 `nodejs_compat`。
- D1 是元数据与一致性中心，不存储文件字节。
- R2 是对象存储，不承担权限判断。
- API 无本地磁盘状态； isolate 内存只能做短时缓存。
- scheduled handler 每日运行维护任务。
- 所有用户请求必须经过 Access JWT 验证，`/api/health` 与受控公开分享路径除外。

## 3. 服务端模块边界

当前结构：

```text
server/index.ts        应用装配、路由挂载、scheduled 入口
server/middleware      Access、admin、workspace 上下文
server/routes          HTTP 路由
server/data            面向业务的 D1/R2 用例
server/lib             节点、SQL、错误、审计、日志、设置等基础能力
```

目标依赖方向：

```text
routes → data/application → lib/domain → D1/R2 adapter
```

新增代码必须遵守：

1. route 不直接写新的 SQL；优先调用 data/lib 模块。
2. data 模块不依赖 React 或 HTTP Context。
3. 权限判断必须在进入业务写操作前完成。
4. 跨模块数据访问只能通过明确函数，不允许绕过 workspace 隔离。
5. 高风险 D1 写操作优先与审计语句进入同一 batch。

现有 route 内 SQL 是待重构债务，不允许继续扩大。

## 4. 请求流

### 认证请求

1. `accessMiddleware` 验签 Cloudflare Access JWT。
2. 绑定或创建用户，检查 disabled / approved 状态。
3. 解析默认 workspace 或 admin act-as 目标 workspace。
4. 将 `user`、`selfId`、`selfUser`、`workspace`、`role` 写入 Hono context。
5. route 执行业务用例并返回 JSON / stream。

### 公开分享

1. `/s` 页面和 `/api/s/*` 在 Access Bypass 应用中匿名可达。
2. Worker 校验 token、撤销状态、有效期、提取码会话、下载次数。
3. 响应设置 `no-referrer` 与 `noindex`。
4. 匿名访问只能触达被分享子树，不能查询全站。

## 5. 文件树模型

`nodes` 使用邻接表 + 物化路径：

- `parent_id` 保存直接父节点。
- `path` 保存祖先 id 链。
- 每个 workspace 有一行根哨兵。
- 常用索引以 `workspace_id` 为前缀。
- 软删不删除行，`deleted_at IS NULL` 表示活跃。
- 搜索必须 join `nodes` 并过滤软删。

选择该模型的原因：目录浏览、子树移动、批量删除和 D1 读写成本在当前规模下可预测；闭包表会增加写入与容量成本。

## 6. 对象与元数据一致性

D1 是可提交真相，R2 是对象存储：

1. 上传创建 R2 对象与 D1 元数据。
2. 删除先软删 D1 行。
3. 彻底删除时将候选 R2 key 写入 `orphan_objects`。
4. cron 延迟复查引用，确认无引用后才物理删除。
5. `workspaces.used_bytes` 是配额真相，`storage_stats` 是解释性统计。

禁止在请求处理中“D1 删除成功后立即 R2 删除”且无孤儿补偿。

## 7. 前端架构

```text
client/src/api        API client 与 DTO
client/src/pages      页面容器
client/src/components 展示与交互组件
client/src/hooks      状态、选择、上传、键盘等 hooks
client/src/shell      导航壳与账号上下文
client/src/lib        纯工具
```

规则：

- 页面只组装，不复制业务策略。
- 服务端是权限与配额唯一真相，前端状态只优化体验。
- TanStack Query key 必须包含 workspace / 目录 / 用户维度，避免 act-as 缓存串号。
- 上传队列持久化不得绕过服务端上传状态。
- UI 设计令牌以 `DESIGN.md` 与 `index.css` 为准。

## 8. 定时任务

当前 scheduled 任务：

- 清理过期回收站；
- 清扫孤儿 R2 对象；
- 中止过期上传；
- 清理分享提取码尝试；
- 清理过期分享会话；
- 校准 workspace `used_bytes`。

架构要求：

- 每个任务必须幂等；
- 单任务失败不应导致其他任务语义丢失；
- 对外效果必须可从 D1 状态验证；
- 新任务必须先写测试，再接入 scheduled handler。

## 9. 部署视图

- Worker：`server/index.ts`
- 静态资源：`client/dist`
- D1：`mstor`
- R2：`mstor`
- 生产域名：`stor.msxor.com`
- 自动构建不允许先部署依赖新 schema 的代码再迁移 D1。

## 10. 已接受的技术取舍

- 不拆微服务：当前规模下模块化单体更可靠。
- 不自建认证：Cloudflare Access 是准入边界。
- 不用闭包表作为主树存储。
- 不用公开 R2 域名或长期签名 URL 承载私有下载。
- 不做服务端视频转码；缩略图由客户端生成，服务端限制大小与类型。
