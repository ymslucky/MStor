# API 规范

状态：Accepted
实现来源：`server/index.ts` 与 `server/routes/`

## 1. 通用约定

- Base path：`/api`
- 成功 JSON 直接返回领域对象；失败返回：

```json
{ "error": { "code": "CODE", "message": "人类可读信息" } }
```

- 时间为毫秒 Unix timestamp。
- 字节数为整数。
- 列表接口有明确上限，批量节点 id 上限 500。
- 未认证返回 401；账号待审核返回 403 `ACCOUNT_PENDING`。
- 跨租户资源返回 404；显式权限不足返回 403。

## 2. 认证

受保护 API 依赖 Cloudflare Access JWT：

- Header：`Cf-Access-Jwt-Assertion`
- Issuer：`ACCESS_TEAM_DOMAIN`
- Audience：`ACCESS_AUD`
- Algorithm：RS256
- 必须包含 `exp`

非 GET/HEAD 请求执行同源 CSRF 防护。

Admin act-as：

- 常规 API 使用 `x-act-as` header。
- 浏览器原生 content/thumb GET/HEAD 可用 `act_as` 查询参数。
- 仅平台管理员有效；非管理员忽略或拒绝，不得改变租户归属。
- 进入空间必须调用显式 act-as 端点并审计一次。

## 3. 端点地图

### Health

- `GET /api/health`：匿名健康检查。

### 当前用户与管理

- `GET /api/me`
- `GET /api/me/admin/users`
- `GET /api/me/admin/settings`
- `PATCH /api/me/admin/settings`
- `GET /api/me/admin/overview`
- `POST /api/me/admin/act-as`
- `PATCH /api/me/admin/users/:id`

### 目录

- `GET /api/dirs/tree`
- `POST /api/dirs`
- `POST /api/dirs/ensure`

### 文件

- `GET /api/files`
- `PATCH /api/files/:id`
- `POST /api/files/:id/copy`
- `POST /api/files/operations/:id/undo`
- `POST /api/files/:id/thumb`
- `GET /api/files/:id/thumb`
- `GET /api/files/:id/content`
- `PUT /api/files/upload`
- `DELETE /api/files/:id`
- `POST /api/files/instant`
- `POST /api/files/batch-delete`
- `POST /api/files/batch-move`

### 分片上传

- `POST /api/uploads`
- `GET /api/uploads`
- `POST /api/uploads/:id/part-urls`
- `POST /api/uploads/:id/complete`
- `DELETE /api/uploads/:id`

### 回收站

- `GET /api/trash`
- `POST /api/trash/batch-restore`
- `POST /api/trash/batch-purge`
- `POST /api/trash/:id/restore`
- `DELETE /api/trash/:id`

### 分享（认证）

- `POST /api/shares`
- `GET /api/shares`
- `DELETE /api/shares/:id`
- `POST /api/shares/batch-revoke`

### 公开分享（匿名）

- `GET /api/s/:token`
- `GET /api/s/:token/children/:dirId`

公开内容/下载路径由分享元数据返回，必须经过 token / 会话 / 次数校验。

### 搜索与整理

- `GET /api/search`
- `GET /api/library/favorites`
- `PUT /api/library/favorites/:id`
- `DELETE /api/library/favorites/:id`
- `GET /api/library/recent`
- `POST /api/library/views/:id`
- `GET /api/library/tags`
- `POST /api/library/tags`
- `PATCH /api/library/tags/:tagId`
- `DELETE /api/library/tags/:tagId`
- `GET /api/library/node-tags/:nodeId`
- `GET /api/library/tags/:tagId/nodes`
- `PUT /api/library/tags/:tagId/nodes/:nodeId`
- `DELETE /api/library/tags/:tagId/nodes/:nodeId`

### 通知

- `GET /api/notifications`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`

## 4. 常用错误码

| Code | 场景 |
|---|---|
| `UNAUTHORIZED` | Access JWT 缺失或无效 |
| `ACCOUNT_PENDING` | 待审核账号访问非 `/api/me` |
| `FORBIDDEN` | 权限不足 / CSRF 拒绝 |
| `NOT_FOUND` | 资源不存在或跨租户不可见 |
| `BAD_REQUEST` | 参数错误 / 非法 JSON |
| `CONFLICT` | 同名冲突等状态冲突 |
| `RATE_LIMITED` | 分享提取码等限流 |
| `QUOTA_EXCEEDED` | 个人空间配额不足 |
| `STORAGE_FULL` | 站点全局预算不足 |
| `BAD_GATEWAY` | R2 / 上游暂时不可用 |
| `INTERNAL` | 未分类服务端错误 |

## 5. 内容与 Range

- `GET /api/files/:id/content` 支持浏览器原生下载和预览。
- Range 请求返回 206。
- 不合法 Range 按标准语义处理。
- 缩略图不可变，可使用私有长缓存。
- 公开分享下载的 Range / 预览不应重复扣减下载次数，完整下载按 dedupe key 计数。

## 6. 兼容性规则

- 不得删除或改语义既有端点，除非先进入弃用周期。
- 新字段可添加；客户端必须容忍未知字段。
- 客户端不再消费的字段先停止使用，再评估服务端删除。
- 状态码变化必须视为破坏性变更。
- 批量上限、分页 key、排序枚举变化必须写入本文并补测试。

## 7. API 变更清单

修改 API 时必须同步：

1. `docs/spec/API.md`
2. `client/src/api/*` 类型与调用
3. 服务端 route 测试
4. 客户端组件测试
5. 错误文案与可访问性
6. OpenAPI / contract 测试若未来引入时的定义
