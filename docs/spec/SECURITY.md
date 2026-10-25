# 安全规范

状态：Accepted

## 1. 身份与准入

- Cloudflare Access 是登录和准入边界。
- Worker 对受保护 API 二次验签，不能信任未验证的 edge 状态。
- `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD` 必须与生产应用一致。
- RS256 显式固定，不允许算法混淆。
- 不自建密码、会话或找回流程。
- 未知身份是否建号由 `ACCESS_PROVISION` 与注册设置控制。

## 2. CSRF

非 GET/HEAD 请求：

- `Sec-Fetch-Site` 存在且非 same-origin/same-none 时拒绝；
- `Origin` 存在且协议 + host + port 不同源时拒绝；
- 非浏览器客户端缺少这些头时可放行，仍需认证。

## 3. 租户隔离

- 所有资源读取以 `workspace_id` 为第一隔离维度。
- 跨租户资源统一 404。
- 权限不足的已知资源才使用 403。
- admin act-as 不改变审计中的原始 actor。
- act-as 时忽略客户端残留的普通 workspace header，目标必须是该用户默认空间。
- 前端 query key / 本地状态必须随身份切换清理，避免缓存串号。

## 4. 公开分享

必须同时满足：

1. token 存在且未撤销；
2. 未过期；
3. 无密码或已持有有效匿名会话；
4. 未超过最大下载次数；
5. 目标文件属于分享节点子树；
6. 提取码尝试未触发限流。

安全要求：

- 提取码使用 PBKDF2 与随机盐。
- 失败尝试按 token + IP hash 限流。
- 匿名页面设置 `Referrer-Policy: no-referrer`、`X-Robots-Tag: noindex, nofollow`。
- 分享 URL 不包含内部 node id。
- 撤销后必须立即不可访问。
- 密码会话 cookie 必须 HttpOnly，并有短过期时间。

## 5. 上传与内容安全

- 上传前校验父目录、文件名、大小、配额和全局预算。
- 文件名做服务端规范化，不信任客户端路径。
- 缩略图限制类型与大小。
- 内容响应设置 `X-Content-Type-Options: nosniff`。
- HTML/SVG 等可执行内容不得在同源上下文中内联预览；当前策略优先下载或安全降级。
- R2 key 必须由服务端生成或验证，不能接受任意客户端 key。

## 6. 审计

审计原则：记录控制面、破坏性动作和高风险外链，不记录普通列表读取。

应记录：

- admin act-as；
- 用户审批 / 停用 / 配额变更；
- 平台设置变化；
- 删除、批量删除、彻底删除；
- 分享创建 / 撤销 / 批量撤销；
- 高风险拒绝或失败事件（有明确排障价值时）。

实现要求：

- 事件包含 actor、workspace、action、resource、result、severity、request id、时间。
- 能与业务 D1 写入同 batch 的必须同 batch。
- 涉及 R2 的流程必须有补偿或后续审计策略。
- 审计开关关闭时，修改安全配置本身仍应有可追溯机制。
- 历史审计不得改写或删除。

## 7. 密钥与配置

- 敏感值使用 Cloudflare secrets 或本地 `.dev.vars`。
- 禁止提交密钥、生产日志、用户邮箱、文件名、分享 token。
- `wrangler.jsonc` 中只允许非敏感配置。
- Access Bypass 路径仅限 `/s`、`/s/*`、`/api/s/*`、`/api/health`。
- `predeploy` 的 Access 配置校验失败时必须阻断部署。

## 8. 依赖与供应链

- CI 必须保持类型检查、lint、测试、构建通过。
- 引入新依赖前必须说明必要性、维护状态、包体积和替代方案。
- 运行时依赖漏洞不允许长期搁置；high/critical 必须立即处理。
- 不使用不可复现的远程脚本执行构建。

## 9. 安全测试必测矩阵

每次涉及认证、分享、文件读取、admin 功能时必须覆盖：

- 匿名访问；
- 普通用户访问他人资源；
- pending 用户访问；
- disabled 用户访问；
- admin act-as；
- 撤销 / 过期 / 超次数分享；
- 提取码限流；
- Range 下载；
- 批量操作跨租户 id；
- CSRF 拒绝；
- 配额与全局预算。
