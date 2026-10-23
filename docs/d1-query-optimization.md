# D1 查询读取优化（2026-10-23）

> 生产库：mstor（D1 7d08a95a-6f35-4e8a-850f-682ec77d4f84，APAC/HKG）
> 数据来源：wrangler d1 insights mstor --time-period 7d，以及生产 EXPLAIN QUERY PLAN + 查询 meta.rows_read。
> 当前数据规模：1 workspace / 1 user / 325 nodes / 24 audit / 25 node_views / 7 shares。
> 说明：30d insights 里仍有旧版 owner_id/迁移 DDL 查询，属于历史 SQL，不作为本轮现网代码优化对象；以 7d 当前查询为准。

## 1. 结论

D1 按「读取行数/写入行数」计费；rows_read 不仅包含返回行，还包含索引/表扫描。当前主要放大点不是索引缺失的简单问题，而是：

1. **JSON 集合查询被 planner 降级成 workspace 全扫**：nodes id IN (SELECT value FROM json_each(?)) 实际走 idx_nodes_sha(workspace_id)，3 个祖先读了 328 行。
2. **列表/树查询先扫 workspace 再过滤**：目录树查询用 idx_nodes_path 扫全部 325 行，只为返回 9 个目录。
3. **排序没有可用的索引顺序**：审计流、成员列表、membership 鉴权都出现 TEMP B-TREE。
4. **LIKE 子串搜索无法走索引**：短查询（<3 字符）只能扫全 workspace；trigram FTS 需要 ≥3 字符。
5. **精确 COUNT(*) 天然要扫节点**：admin overview 统计每个空间的节点数，索引只能减少回表，不能把 325 行变成 1 行。

## 2. 生产 7d Top 查询

| 查询 | 次数 | 总读行 | 平均读行 | 返回/读 |
|---|---:|---:|---:|---:|
| memberships JOIN workspaces（鉴权 + 空间列表） | 6652 | 19956 | 3 | 0.33 |
| nodes 按 parent 列表 | 747 | 10467 | 14 | 0.93 |
| admin overview（members/nodes 子查询） | 26 | 7216 | 277 | 0.0036 |
| users WHERE email | 6052 | 6050 | 0 | - |
| nodes WHERE id/workspace | 3494 | 3494 | 1 | 1 |
| node_views JOIN nodes（最近） | 109 | 2698 | 24 | 0.5 |
| audit_events 最近 20 | 114 | 1196 | 10 | 0.5 |
| nodes id IN json_each（祖先名） | 6 | 664 | 110 | 0.018 |
| 目录树 is_dir=1 | 2 | 520 | 260 | 0.027 |
| LIKE 子串搜索 | 7 | 1919 | 256 | 0.015 |

## 3. 逐条优化

### 3.1 鉴权 / 空间列表（memberships）

原计划：WHERE user_id = ? ORDER BY m.created_at, w.id；
索引只有 (user_id)，排序走临时 B-tree，join 后再取 workspace。

处理：
- 新增覆盖索引 (user_id, created_at, workspace_id, role)；
- 排序改为 ORDER BY m.created_at, m.workspace_id（与 w.id 等值），直接吃索引顺序。

生产实测：3 行读 → 2 行读，临时 B-tree 消失。

### 3.2 成员列表（memberships）

新增 (workspace_id, created_at)，WHERE workspace 前缀 + ORDER BY created_at
从 3 行读 → 2 行读。

### 3.3 审计流（audit_events）

原查询无 workspace 过滤，ORDER BY created_at DESC；只有 (workspace_id, created_at) 索引，导致全表扫描 + 临时排序。
新增 (created_at DESC)，生产实测 72 行读 → 40 行读（20 行审计 + 20 行用户 LEFT JOIN，已接近最小）。

### 3.4 最近访问（node_views）

原索引 (user_id, viewed_at) 不含 workspace，先按 user 扫再过滤。
新增 (workspace_id, user_id, viewed_at DESC)，查询顺序/过滤都命中；当前 1 workspace 下仍是 20 views + 20 nodes = 40 行读，但多租户下不会读到其他空间的记录。

### 3.5 目录树（nodes is_dir=1）

原 idx_nodes_path(workspace_id,path) 需要扫所有节点再过滤 is_dir/deleted。
新增部分索引 (workspace_id, path, name) WHERE is_dir=1 AND deleted_at IS NULL AND name <> ''。
生产实测 334 行读 → 9 行读（返回 9 个目录）。

### 3.6 祖先名回填（nodes id IN json_each）

原 SQL：
  SELECT id, name FROM nodes WHERE workspace_id=? AND id IN (SELECT value FROM json_each(?))
planner 选 idx_nodes_sha(workspace_id) 全扫 workspace。
改为：
  SELECT ... FROM nodes INDEXED BY sqlite_autoindex_nodes_1
强制按主键逐 id 点查。
生产实测 328 行读 → 9 行读（3 个 id；9 = 索引+表访问计数）。

同样的纯 id 集合查询也应用到回收站：
- 彻底删除 roots；
- 删除闭包；
- 批量软删选中项；
- 批量移动选中项。

### 3.7 子串搜索（search）

- ≥3 字符已走 FTS5 trigram，生产实测 FTS 15 行读 vs LIKE 330 行读；
- <3 字符 trigram 无法命中，只能 LIKE 全扫；这是当前唯一保留的高读路径。
- 不建议把 1-2 字符改成前缀匹配（会改变「包含」语义）；如果产品接受，可设置最小搜索长度或在 UI 提示继续输入。

### 3.8 admin overview 节点数

  (SELECT COUNT(*) FROM nodes n WHERE n.workspace_id = w.id AND n.deleted_at IS NULL)
精确 count 必须扫该空间节点；生产实测 328 行读，索引无法消除。
当前 admin 页 7d 仅 26 次，暂不引入 node_count 冗余列（会带来每节点写放大/触发器成本）。
如果管理页访问量上来，建议：
- 在 storage_stats 增加 node_count 并由节点写路径增量维护；或
- 管理页 30-60s Cache API 缓存。

### 3.9 其余查询

- nodes WHERE id + workspace：PK，1 行读，已最优；
- users WHERE email：唯一索引，0 行读（未命中）；
- settings key：主键，1 行读；
- shares token：唯一索引；
- tags 计数：node_tags PK 覆盖；
- 纯 id IN (?,?,?)：PK 每条，D1 计 2 倍（索引 + 表）是正常下限。

## 4. 落地内容

- migrations/0017_query_perf_indexes.sql（已应用到生产，6 条 CREATE INDEX）；
- sql/schema.sql、sql/v2/schema.sql 同步索引；
- server/lib/sql.ts 增加 NODES_PK_INDEX；
- server/routes/search.ts 祖先回填强制 PK；
- server/data/trash.ts 四处纯 id 集合查询强制 PK；
- server/data/workspaces.ts membership 排序改 m.workspace_id，消除临时排序。

## 5. 验证

- 生产迁移：0017 已执行，6 条索引创建成功；Worker 已部署（版本 3e52c7d0-c52c-457f-941f-c6d24069b84d）；
- EXPLAIN 复核：audit 走 idx_audit_created；tree 走 idx_nodes_dirs_tree；ancestor 走 PK；membership 走覆盖索引且无 TEMP B-TREE；
- 本地：tsc / eslint / test:server:local 32 项 / check:migrations 19 文件 / check:schema 通过。

## 6. 后续监控

- 用 wrangler d1 insights mstor --time-period 7d --sort-by reads 观察新查询形状；
- 重点看：LIKE 短查询、admin overview 的 COUNT、以及新增多租户数据后的 workspace 前缀索引；
- 不在 Worker 内做全表 SUM；新增统计优先考虑带 workspace 前缀的覆盖索引。
