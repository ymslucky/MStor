# 运维规范

状态：Accepted

## 1. 环境与资源

| 资源 | 名称 / 配置 |
|---|---|
| Worker | `mstor` |
| D1 | `mstor` |
| R2 bucket | `mstor` |
| 生产域名 | `stor.msxor.com` |
| Cron | 每日 03:00 |
| 静态资源 | `client/dist` |
| Workers dev | 关闭 |

敏感配置：

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

通过 `wrangler secret` 管理。非敏感配置在 `wrangler.jsonc`。

## 2. 动态配置

全局 settings：

| key | 含义 | 默认/期望 |
|---|---|---|
| `audit_enabled` | 是否写新审计 | 安全基线建议开启 |
| `trash_retention_days` | 回收站保留天数 | 建议 30，需产品确认 |
| `registration_enabled` | 是否允许新身份注册 | 默认开启 |
| `registration_requires_approval` | 注册后是否待审 | 默认开启 |
| `default_quota_bytes` | 新个人空间默认配额 | 至少 1 GiB |

当前生产已知风险：

- `audit_enabled=0`
- `trash_retention_days=1`

这两个值已通过只读查询核实。若非有意配置，应经管理员确认后恢复为安全基线，并把决策记录到 ADR。

## 3. 发布流程

```text
1. npm run check
2. npm run test:ci
3. npm run test:server:local
4. 备份 / 确认 D1 Time Travel 可用
5. npx wrangler d1 migrations list mstor --remote
6. npx wrangler d1 migrations apply mstor --remote
7. npm run deploy
8. GET /api/health
9. 登录用户只读烟测
10. 观察错误日志与 cron
```

禁止：

- 先部署依赖新 schema 的代码，再迁移 D1；
- 跳过备份执行破坏性 SQL；
- 在一次发布中混合破坏性迁移、重构和 UI 改版；
- 未授权直接修改生产。

## 4. 回滚

| 对象 | 策略 |
|---|---|
| Worker 代码 | `npx wrangler rollback` 或 revert 后重新部署 |
| 静态资源 | 随 Worker deployment 回滚 |
| D1 additive migration | 通常回滚 Worker 即可 |
| D1 destructive migration | 使用迁移前 export / Time Travel，必须先评估数据反向兼容 |
| 配置 | 设置页恢复并记录原因 |
| R2 | 不直接批量删除；通过 orphan 队列与引用检查 |

回滚后必须验证：

- health；
- 登录；
- 文件列表；
- 上传/下载小文件；
- 分享撤销；
- cron 无错误。

## 5. 备份

- 每次 migration 前执行 D1 export；
- 保留最近至少一次可恢复备份；
- R2 生命周期与备份策略需单独确认；
- 备份文件不得存入仓库；
- 恢复演练记录不提交仓库，但恢复步骤必须在本文件保持可执行。

## 6. 监控与告警

最低要求：

- Worker invocation logs 开启；
- 5xx 与 unhandled error 可查询；
- scheduled cron 失败可发现；
- D1 / R2 错误可按 route 聚合；
- 生产安全配置漂移可发现；
- 存储水位与配额异常可发现。

建议告警通道：

- Cloudflare notifications；
- Workers logs 外发；
- 定期只读配置巡检。

## 7. 只读巡检

可用于安全检查的只读 SQL 维度：

```sql
SELECT scope, key, value FROM settings ORDER BY key;
SELECT COUNT(*) FROM users WHERE disabled_at IS NOT NULL;
SELECT COUNT(*) FROM users WHERE approved_at IS NULL;
SELECT COUNT(*) FROM orphan_objects;
```

禁止在输出中展示用户邮箱、文件名或 token。

## 8. Cloudflare Access 运维

必须保持：

- Worker 级 Access 保护覆盖全部入口；
- Bypass 应用仅放行公开分享与 health 路径；
- `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` 与控制台一致；
- predeploy 配置校验通过。

变更 Access 后必须验证：

- 受保护 API 未登录 302/401；
- `/api/health` 匿名可达；
- 公开分享匿名可达；
- 已撤销分享不可达；
- 登出后 API 不可访问。

## 9. 应急处理

### API 全量 500

1. 查最近部署与 migration 时间；
2. 若代码先于 schema 上线，立即 `wrangler rollback`；
3. 补齐 migration 前必须确认旧代码不再访问新列；
4. 用 health 与 `/api/me` 验证。

### 存储统计漂移

1. 只读对比 `workspaces.used_bytes` 与活跃 nodes SUM；
2. 等待每日校准 cron；
3. 若仍漂移，查上传 / 删除 / 恢复路径日志；
4. 修复必须补回归测试。

### R2 对象异常

1. 查 `orphan_objects`；
2. 只读确认 key 是否仍被 nodes / thumbs / versions 引用；
3. 禁止手工批量删除；
4. 通过受测试的清扫流程处理。

### 分享疑似泄露

1. 撤销分享；
2. 查审计与下载记录；
3. 检查提取码限流；
4. 必要时轮换 token 策略并补安全测试。
