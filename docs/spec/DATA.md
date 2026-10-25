# 数据规范

状态：Accepted
事实来源：`sql/schema.sql` 与 `migrations/`

## 1. 存储分工

| 存储 | 负责 | 禁止 |
|---|---|---|
| D1 | 用户、workspace、文件元数据、权限、分享、上传状态、审计、配置 | 存文件字节、大 JSON 日志 |
| R2 | 文件对象、缩略图 | 权限判断、业务状态 |
| Worker isolate | 短时缓存，如 JWKS / 审计开关 | 可信持久状态 |

## 2. 表分组

### 身份与空间

- `users`：Access 身份、展示信息、平台管理员、审核与停用状态。
- `workspaces`：个人空间、配额、已用字节。
- `memberships`：用户与空间关系；个人空间正常只有一条 owner 记录。

### 文件树

- `nodes`：文件与目录统一元数据，物化路径、软删、R2 key、SHA-256、缩略图与媒体属性。
- `nodes_fts`：文件名/目录名 FTS5 trigram 索引，由触发器同步。
- `uploads`：multipart / 断点续传 / 秒传会话。
- `file_versions`：版本管理预留，当前无产品功能。
- `operations`：移动/改名短期撤销载荷。

### 分享

- `shares`：公开 token、提取码哈希、有效期、次数、撤销状态。
- `share_auth_attempts`：提取码尝试限流。
- `share_sessions`：密码分享匿名短会话。
- `share_downloads`：下载计数与去重。

### 使用与整理

- `favorites`：用户收藏。
- `node_views`：最近访问，按用户/节点节流。
- `tags` / `node_tags`：空间内标签与关联。
- `notifications`：站内通知。

### 治理

- `audit_events`：动作级审计。
- `storage_stats`：四分项解释统计。
- `settings`：全局动态配置。
- `orphan_objects`：R2 延迟物理删除队列。

## 3. 关键不变量

1. 每个 workspace 恰好一行根哨兵：`parent_id='' AND name=''`。
2. 活跃节点在 `(workspace_id, parent_id, name)` 上唯一；回收站同名不占名。
3. 真实节点 `created_by` 必填；根哨兵可为 NULL。
4. 子节点 `path = parent.path + parent.id + '/'`。
5. 所有业务查询必须显式绑定 `workspace_id`。
6. `workspaces.used_bytes >= 0`，配额扣减必须原子。
7. 分享最大下载次数扣减必须原子且不能为负。
8. 软删节点不得出现在正常列表、目录树、收藏、最近访问与搜索结果。
9. FTS 搜索必须 join `nodes` 并过滤 `deleted_at IS NULL`。
10. 删除 workspace 时 `nodes` 不级联，防止 R2 对象静默失去引用。
11. R2 物理删除必须经过 `orphan_objects` 延迟复查。
12. `sql/schema.sql` 与全部 migration 最终态必须对象级等价。

## 4. 标识与时间

- 主键使用 UUID 字符串或由应用生成的唯一 id。
- 外部分享 token 使用随机 token，不能暴露内部 id。
- 时间戳统一使用毫秒 Unix 时间。
- 对外 API 不得泄露不必要的内部 id；已暴露 id 视为契约，变更需兼容策略。

## 5. 迁移策略

新增迁移要求：

1. 优先 additive；避免 DROP / RENAME 造成旧版本立即不可用。
2. 需要破坏性变更时采用 expand → migrate → contract。
3. 大规模回填拆分批次，不能在一条 SQL 中无限扫描。
4. 新索引必须说明查询路径与写入成本。
5. migration 文件一旦合入 master 不得修改；修正通过新 migration。
6. 全量 schema 同步更新，`npm run check:migrations` 必须通过。

既有环境升级顺序：

```text
备份 D1
       ↓
wrangler d1 migrations list
       ↓
wrangler d1 migrations apply
       ↓
部署依赖新 schema 的 Worker
       ↓
健康检查与只读烟测
```

## 6. 数据保留

| 数据 | 当前策略 |
|---|---|
| 审计事件 | 由全局设置控制写入；历史事件不删除 |
| 回收站 | 全局保留天数，cron 清理 |
| 分享尝试 / 会话 | 短窗口自动清理 |
| 过期上传 | scheduled 任务中止/清理 |
| 孤儿 R2 对象 | 延迟复查后清理 |

生产当前需要治理的配置风险见 `docs/spec/OPERATIONS.md`。数据保留要求若外部合规变化，必须更新本节与 ADR。

## 7. 数据完整性测试

`npm run check:schema` 至少覆盖：

- 全部表与索引存在；
- 外键生效；
- 根哨兵唯一；
- 活跃同名唯一；
- 物化路径一致性；
- 配额原子更新；
- 分享次数原子扣减；
- workspace 删除保护；
- FTS 触发器；
- 批量软删 / 彻底删除语句预算；
- 孤儿对象清扫引用保护。
