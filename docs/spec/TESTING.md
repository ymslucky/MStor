# 测试规范

状态：Accepted

## 1. 质量门禁

必须保持：

```bash
npm run check
npm audit --omit=dev --audit-level=moderate
npm run test:client
npm run test:server
npm run build
npm run check:schema
npm run check:migrations
```

CI 执行运行时依赖审计、`npm run test:ci`、`npm run check` 与 `npm run test:server:local`。

Windows 本机 workerd 失败时，`npm run test:server:local` 是可接受的本地降级，但不能替代 CI 的 Workers runtime 测试。

## 2. 测试分层

| 层 | 工具 | 目标 |
|---|---|---|
| Schema 不变量 | `node:sqlite` + 自研脚本 | DDL、外键、唯一性、批量语义 |
| 服务端单元 / 集成 | Vitest + Cloudflare workers pool | route、认证、D1、R2 shim |
| 本地集成兜底 | `scripts/test-server.cjs` | 真实生产函数 + D1 shim |
| 客户端单元 / 组件 | Vitest + Testing Library / jsdom | hooks、组件交互、API client |
| 可访问性 | axe / 自定义断言 | 键盘、焦点、对比度、语义 |
| 视觉烟测 | headless Chrome/Edge + 基线 | 关键页面布局与溢出 |
| 生产烟测 | 只读 HTTP | health、身份、列表、公开分享边界 |

## 3. 必测场景

### 认证 / 权限

- Access JWT 验签成功与失败；
- pending 用户仅可读 `/api/me`；
- disabled 用户拒绝；
- admin act-as 上下文与审计；
- 跨 workspace 404；
- CSRF 拒绝。

### 文件树

- 根哨兵创建；
- 嵌套目录 path；
- 重命名 / 移动后子树 path 平移；
- 同名冲突；
- 软删后路径与列表状态；
- 恢复到已删除父目录时回根；
- 500 项批量语句预算。

### 上传 / 下载

- 小文件直传；
- multipart 初始化、恢复、完成、取消；
- SHA-256 秒传；
- 配额不足与全局预算不足；
- Range 206；
- 下载字节一致；
- 缩略图限制。

### 回收站

- 单个/批量软删；
- 单个/批量恢复；
- 彻底删除；
- 保留策略；
- R2 孤儿登记与延迟清扫；
- 存储统计与配额一致。

### 分享

- 创建 /撤销 / 批量撤销；
- 有效期；
- 提取码；
- 次数原子扣减；
- Range / 下载管理器去重；
- 目录子树访问边界；
- noindex / no-referrer。

### 搜索 / 收藏 / 标签

- FTS 中文与子串；
- 软删过滤；
- 类型与大小过滤；
- 分页；
- 用户隔离；
- 标签冲突与绑定解绑。

### 前端

- 空态、加载态、错误态；
- 键盘导航；
- 单选 / 多选 / Shift / Esc；
- 上传队列刷新恢复；
- 错误边界；
- 移动布局；
- act-as 状态清理。

## 4. 测试编写规则

- 测试名描述业务行为，不描述实现细节。
- 一个测试只断言一个主行为，允许附带必要前置不变量。
- 不 mock 掉被测权限逻辑；权限测试必须走真实中间件或等价组装。
- 不用固定当前时间；注入或构造时间边界。
- 不在快照中包含真实用户、邮箱、token、文件名。
- 失败测试必须先复现，再修复；禁止直接改期望。
- 修 bug 时先添加回归测试。

## 5. 覆盖率口径

当前客户端基线：

- Statements：约 88.7%
- Branches：约 83.7%

新增代码要求：

- 不低于当前基线；
- 新增安全、上传、删除、分享逻辑必须覆盖成功、失败、并发/重复请求；
- 覆盖率不替代高风险动作矩阵评审。

## 6. 视觉测试

- 基线目录：`docs/design/v9`
- 默认检查布局与横向溢出；
- 有意改版时更新基线；
- 更新基线不得与逻辑修复混在同一提交；
- 对比阈值默认 1.5%，可通过 `VISUAL_DIFF_MAX` 调整。

## 7. 发布前验证

生产发布前：

1. CI 全绿；
2. `npm run check` 通过；
3. schema / migration 校验通过；
4. staging 或本地完整烟测；
5. 生产只读 health 与身份验证；
6. 观察 5xx、D1 错误、R2 错误。
