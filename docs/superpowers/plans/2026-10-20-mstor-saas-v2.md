# MStor SaaS 化方案 v2.1（合并版）

> **状态**：待评审 ｜ **日期**：2026-10-20 ｜ **基线**：`master` @ `40e6852`
> **取代**：`2026-10-18-mstor-refactor-plan.md`（工程债核实记录）、`2026-10-20-mstor-commercial-plan.md`（A 路线的商业级方案）——两者已移入 `docs/superpowers/archive/`，本文件是唯一权威。
> **性质**：这不是一次重构，是换赛道。把「单租户的家庭私有盘」变成「邀请制多租户托管（≤50 用户，Access + GitHub 登录，无自助注册）」。
> **v2.1 变更（三条评审意见落地）**：① 认证**保留 Cloudflare Access 并接入 GitHub IdP**，撤销自建密码/会话/邮件（P1 由 3–4 周降到 2 周）；② 检索**只做文件名**，明确不做正文抽取/OCR/全文检索；③ 树模型按 §4.2 结论**保留邻接表+物化路径**，闭包表仅作 ACL 读模型备选。
> **本版补强**：针对评审意见，新增 **§4.2 数据库树模型（物化路径 vs 闭包表完整设计）**、**§4.3 在线预览与 Range 协议**、**§4.4 上传/会话/隔离/分享/搜索/版本/缓存关键链路**；不再停留在功能清单。

---

## 0. 决策记录

| ID | 决策 | 结论 | 推翻/保留 |
|---|---|---|---|
| **D-a** | 重写形态 | **同仓库原地演进，逐域替换** | 保留仓库/数据模型/测试框架；不另起代码库 |
| **D-b** | 现网数据 | **仅测试数据，可清库重建** | 不需要迁移设计与回滚 SQL；直接按 2.0 模型建库 |
| **D-c** | 产品边界 | **多租户，邀请制**：单部署多 workspace、≤50 用户、无自助注册 | **不推翻** Access 认证链路；新增 workspace 隔离与成员准入 |
| **D-d** | 成本基调 | **Free-first**（Workers/D1/R2/Access 均吃免费额度），仅 R2 超 10GB 按量付费 | 单次调用 ≤50 子请求是硬预算 |
| **D-e** | 文档 | 合并为单一权威（本文件） | 旧两份归档不再维护 |
| **D-f** | 认证 | **保留 Cloudflare Access + GitHub 身份提供方**；不自建密码与会话 | 省掉会话表/密码哈希/注册/邮件约 3 周；代价是无自助注册 |
| **D-g** | 检索 | **仅文件名检索**；不做正文抽取/OCR/全文检索 | 不需要 content 表与抽取流水线；搜索 2.0 只做过滤/分页/高亮 |
| **D-h** | 树模型 | **邻接表 + 物化路径**（对比见 §4.2） | 闭包表只作 workspace 级 ACL 读模型备选 |
| **D-i** | 用户规模 | ≤50 用户（Access 免费上限），不做规模化设计 | 超限则 Access 付费或回到自建认证 |

### 0.1 仍按推荐值执行的假设（未答即按此推进，任一条可单独推翻）

| 假设 | 取值 | 若推翻会改变什么 |
|---|---|---|
| **A1 成员准入** | 应用内邀请令牌 → 用户经 Access(GitHub) 首登自动落 membership；不发事务邮件 | 若必须自助邀请：需要邮件通道（Resend 等）并处理投递失败 |
| **A2 计费** | 1.0 不含支付，接 Stripe 放 1.x | 1.0 若含订阅：+4–6 周（支付/对账/发票/税率/订阅生命周期） |
| **A3 租户隔离** | 单 D1 库 + `workspace_id` 行级隔离 | 每租户独立库：数据访问层与运维全部翻倍，Free 版绑定管理不可行 |

### 0.2 保留 Access 的边界与代价（D-f 的推论，必须写在明面上）

| 项 | 事实 | 影响 |
|---|---|---|
| 认证层 | Access 在边缘完成登录（GitHub OAuth）并注入 `Cf-Access-Jwt-Assertion`；`server/middleware/access.ts` 已用 jose 验签（iss/aud/RS256 + 边缘防伪检查） | **认证代码几乎不动**；会话表、密码哈希、验证码、注册/重置全部不做 |
| 授权层 | Access 只回答「能否进门」，不回答「能看哪个 workspace」 | 应用侧必须自建 `workspaceGuard` + membership，这部分省不掉 |
| 双重簿记 | 用户须①在 Zero Trust 侧被允许（GitHub 组织或邮箱白名单）②在应用内有 membership | 拉人=两侧各一步；上线前做「只有①没有②」的告警与管理台视图 |
| 自助注册 | **不可能**（Access 是白名单模型） | 产品定位诚实写「邀请制」；不做注册/找回密码页面 |
| 用户上限 | Access 免费 ≤50 用户；超限 $7/用户/月 | 45 用户时告警；超限改 Access 付费或回自建认证（v2.0 的 A1 设计） |
| 身份锚点 | `users.access_sub`（JWT `sub`）为唯一锚点，现有 UNIQUE 约束直接沿用；`email` 仅作展示与邀请匹配 | GitHub 邮箱可能私有或为 noreply → **不得**把 email 当主键 |
| 待实测 | GitHub 身份下 JWT 是否携带 `email` 声明及其形态 | P0 用一次真实 GitHub 登录解码 JWT 确认，决定邀请匹配按 email 还是按 sub 二次确认 |
| 仍然保留 | `workers_dev:false` + 自定义域名 + 前端 `/auth/renew` + `AUTH_MODE=dev` | 这些都由 Access 模型支撑，**不推翻** |

### 0.3 必须保留的资产（本次演进的地基，动它=自废武功）

| 资产 | 现状证据 | 结论 |
|---|---|---|
| 物化路径树模型（`nodes.path` 祖先 id 链 + 范围扫描） | `server/lib/nodes.ts:8-30`、`sql/schema.sql:36-60` | 保留，仅加 `workspace_id` 并把它放到索引前缀 |
| FTS5 external content trigram + 触发器同步 | `sql/schema.sql:110-121` | 保留，触发器语义不变（rowid 不受租户化影响） |
| `used_bytes` 冗余配额 + 每日校准 | `server/index.ts:34-44`、`lib/nodes.ts:188-196` | 保留并升级为「活跃/回收站/版本/缩略图」四分项 |
| `orphan_objects` 延迟清扫（秒传 TOCTOU 防护） | `sql/schema.sql:88-91`、`routes/trash.ts` | 保留，清扫任务改为有界分片 |
| Range/ETag/inline-attachment 预览协议 | `server/lib/serve.ts:1-59` | 保留并补齐 HEAD/If-Range/304 |
| 分片直传 + 秒传（owner 内去重） | `routes/uploads.ts`、`routes/files.ts:120-160` | 保留，去重维度从 owner 改为 workspace |
| 分享 token / 密码 / 过期 / 下载计数 | `routes/shares.ts`、`sql/schema.sql:63-74` | 保留，增加 `workspace_id` 与下载上限 |

### 0.4 技术选型（本版新增，待确认）

| ID | 选型 | 推荐 | 代价/触发条件 |
|---|---|---|---|
| **T1** | 树模型：物化路径 vs 闭包表 | **邻接表 + 物化路径**；闭包表作为 workspace 级 ACL 读模型（§4.2.4） | 闭包表主树会让 D1 500MB 提前触顶、移动写放大；若 T1 改选闭包表，P1 +1–2 周 |
| **T2** | 在线预览协议 | P1 补齐 `HEAD/Range/If-Range/304/416 + content_version`；P2 上 PDF.js/Office | 不做协议只做 UI，视频拖动/PDF 按页/断点续传都会退化为整包下载 |

---

## 1. 结论（先看这六句）

1. **代码保留率约 65%**：存储/预览/分享/树模型/测试框架留下，认证、隔离、准入、审计是新建。
2. **真正的约束不是代码结构，是两条平台上限**：单次调用 ≤50 子请求、D1 单库 ≤500MB。本方案所有设计围绕这两条。
3. **顺序不可颠倒**：先补安全网 → 再租户化（认证沿用 Access，不动）→ 再补商业功能 → 最后质量与发布。先做功能会让 IDOR 与配额问题被放大。
4. **多租户化把 A 路线的 15 周推到 13–15 周**（单人全栈，含 15% 缓冲）：−3 周（保留 Access，不做自建认证/会话/注册/邮件）、−0.5 周（不做内容检索）、+1.5 周（workspace 租户化 + 双重簿记 + `path` 护栏）。
   > 口径差异说明：v2.0 估的 17–20 周建立在「推翻 Access、自建认证」之上；D-f 把这条改回 Access 后，净增量归零并略低于 A 路线。
5. **本次演进的第一交付物不是功能，而是「不可绕过的隔离」**：所有查询强制 workspace 维度 + IDOR 负例测试矩阵。
6. **技术设计以两条协议为骨架**：树模型用「邻接表 + 物化路径」，闭包表已完整评估但不作 1.0 主树（D1 500MB/写放大）；预览用 `GET/HEAD + Range + ETag/If-Range + 206/416/304`，PDF.js/Office 按需加载。详见 §4.2–4.4。

---

## 2. 现状核实（本次实测，非文档转述）

| 项 | 证据 | 影响 |
|---|---|---|
| 路由模块被当作服务层跨模块 import | `routes/files.ts:8` 从 `routes/trash.ts` 导入 `moveMany/softDeleteMany/permanentDeleteMany`；`routes/me.ts` 从 `routes/uploads.ts` 导入 `PART_SIZE` | 依赖方向混乱，SaaS 改造会扩散 |
| D1 参数预算规则散落 | `chunk(...)` 9 处（`trash.ts` 8 处、`search.ts:34`），字面量 90/30 硬编码 | 新查询每次重新推导 100 参数上限 |
| 配额记账无单一入口 | `assertQuota`/`adjustUsedBytes` 9 处调用点，跨 `files`/`uploads`/`trash` | 上传四步（校验→插入→回滚→记账）靠手工拼装 |
| UNIQUE 冲突靠字符串判断 | `UNIQUE constraint failed` 9 处 | SQLite 文案一变即静默失效 |
| `deleted_at` 语义靠调用方自觉 | `lib/nodes.ts:63-66` 的 `getNode`/`resolveParent` 不过滤软删；`routes/dirs.ts:14` 未检查 → 可向已删目录建节点；`routes/files.ts:34` 已删文件仍可下载 | SaaS 下变成越权与数据不一致入口 |
| 预览协议不完整 | `server/lib/serve.ts:9-60` 无显式 `HEAD`/`If-Range`/`If-None-Match`/304；416 无 `Content-Range: bytes */size`；ETag 只用 node.id；图片 immutable 但 URL 无版本；CSP sandbox 对所有类型 | 视频拖动/PDF 按页可能退化为整包下载或失败；内容替换后旧图仍命中缓存 |
| 客户端 god 组件 | `Browser.tsx` 545、`FileList.tsx` 530、`AppShell.tsx` 215、`useUploadQueue.ts` 247 | 上传队列绑死在页面，离开页面即失控 |
| 无错误边界 | `client/src/App.tsx:68-79` 只有 `Routes`，无 `ErrorBoundary`/`errorElement` | 任何渲染异常=整页白屏 |
| 契约手抄且已漂移 | `client/src/api/types.ts`：`Me.quotaBytes` 驼峰 vs `AdminUser.quota_bytes` 下划线，形状靠人肉对齐 | 无契约层，改字段靠搜 |
| CI 从未在 push 触发 | `.github/workflows/ci.yml:3-5` `branches: [main]`，而仓库主分支是 `master`（191 次提交） | 质量门禁只覆盖 PR，实际从未生效 |
| 测试基线未验证 | 本会话执行 `npm test` 失败：客户端 vitest 配置加载 `spawn EPERM`；升级后 Miniflare `ERR_RUNTIME_FAILURE`（workerd 无法启动） | 330 用例的绿色状态必须在 P0 由本机复核，不能假设 |

---

## 3. 目标架构（SaaS 版）

~~~
浏览器 PWA
 ├─ 静态资源 ────────────────> Workers Assets（免费不限量，run_worker_first 仅 /api/*）
 ├─ 全局上传中心（AppShell + IndexedDB 队列）
 │    ├─ 小文件 PUT ─────────> Worker ─> R2
 │    └─ 大文件分片 ─────────> R2 预签名（批量取 URL）
 └─ API ─> Worker
      ├─ requestId / 子请求预算 / 结构化日志
      ├─ accessMiddleware（Access JWT 验签：iss/aud/RS256，GitHub IdP；身份锚定 users.access_sub）
      ├─ workspaceGuard（membership 判定 + 强制注入 workspace_id）
      ├─ rateLimit（分享口令、上传 init）
      └─ route（只做编排：解析 → 调 domain → 序列化）
 D1：users / workspaces / memberships / invitations / nodes / shares /
     uploads / audit_events / storage_stats / orphan_objects / settings / nodes_fts
 R2：content（沿用）；thumbs（客户端生成 WebP）
 Cron：孤儿清扫(15m) / 遗弃分片(1h) / 回收站+版本(日) / 配额校准+审计归档(日) —— 拆成 4 个独立调用
~~~

### 3.1 服务端目录契约（单一归属）

~~~
server/
  http/      # Hono 路由，只做解析/序列化/状态码
  domain/    # 纯规则：树不变量、配额、命名唯一、分享口令、权限判定（可单测、不碰 D1）
  data/      # D1 访问：查询构造、参数分片、UNIQUE 映射、事务批次
  lib/       # 横切：errors / logger / crypto / r2 / serve / ids / constants
  middleware/# access / workspaceGuard / rateLimit / requestContext
shared/contract/  # 请求/响应类型与边界校验（唯一真相，前后端共用）
~~~

规则：`http/` 不得直接写 SQL 字面量；`domain/` 不得 import `data/`；新增 `lib` 模块需 ≥2 个调用方。

### 3.2 子请求预算（Free 版第一约束）

| 端点 | 现状估算 | 目标 | 手法 |
|---|---|---|---|
| `GET /api/files` | 3（root+list+crumb） | ≤3 | 保持并行 |
| `PUT /api/files/upload` | 4–6 | ≤6 | 配额合并进单条 `UPDATE ... WHERE used+?<=quota` |
| 批量还原 100 项 | 600–800 | ≤40 | 集合式 SQL + 分片到多次请求（客户端续跑） |
| cron（现四任务同一调用） | 可能 >50 | 每任务 ≤40 | 拆 4 个 cron 触发，各自有界分片 |
| 分享页首屏 | 3–4 | ≤4 | 一次 join 取 share+node |
| `GET/HEAD /content`（无 Range） | 3–4 | ≤4 | session/workspace + node + R2 get/head；流式 |
| `GET /content`（Range 206） | 3–4 | ≤4 | 同上；Range 不额外查 D1 |
| `GET /thumb` | 3–4 | ≤4 | 缩略图 key 不可变，可缓存 |
| PDF.js 首屏（1–3 个 Range） | 3–12 | ≤12 | 每个 Range 是独立请求；按页懒加载 |
| 100 图网格 | 300 子请求总量 | 300 | 100 个缩略图请求 × 约 3；lazy 只加载可视区 |

---

## 4. 数据与关键链路设计

### 4.1 数据模型 2.0（DDL 草案，清库重建，无迁移）

~~~sql
-- 身份：认证仍由 Cloudflare Access（GitHub IdP）承担，access_sub 是唯一锚点；不自建密码与会话
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  access_sub TEXT NOT NULL UNIQUE,     -- Access JWT sub（GitHub 身份下同样稳定）
  email TEXT,                          -- 展示与邀请匹配用；GitHub 私有邮箱时可为 NULL
  access_bound_at INTEGER,             -- 首次完成 Access 身份绑定时间
  name TEXT NOT NULL,
  platform_admin INTEGER NOT NULL DEFAULT 0,  -- 与 workspace 角色正交
  disabled_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
-- 租户
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','paid')),
  quota_bytes INTEGER NOT NULL, used_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE memberships (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE invitations (
  token_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL,
  role TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, accepted_at INTEGER
);
-- 文件树：沿用物化路径，隔离维度换成 workspace_id
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT NOT NULL DEFAULT '', path TEXT NOT NULL DEFAULT '/', name TEXT NOT NULL,
  is_dir INTEGER NOT NULL CHECK (is_dir IN (0,1)),
  r2_key TEXT, size INTEGER, mime TEXT, sha256 TEXT,
  content_version INTEGER NOT NULL DEFAULT 1,          -- 版本/缓存键
  thumb_key TEXT, width INTEGER, height INTEGER, taken_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE UNIQUE INDEX idx_nodes_name_active ON nodes(workspace_id, parent_id, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_listing ON nodes(workspace_id, parent_id, is_dir DESC, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_name   ON nodes(workspace_id, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_path ON nodes(workspace_id, path);
CREATE INDEX idx_nodes_sha   ON nodes(workspace_id, sha256);
CREATE INDEX idx_nodes_r2key ON nodes(r2_key);
CREATE INDEX idx_nodes_trash ON nodes(workspace_id, deleted_at) WHERE deleted_at IS NOT NULL;
-- 审计：与业务写在同一 batch 内落库
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY, workspace_id TEXT, actor_id TEXT, action TEXT NOT NULL,
  target_id TEXT, meta TEXT, request_id TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_ws_time ON audit_events(workspace_id, created_at DESC);
-- 存储四分项（单行原子计数）
CREATE TABLE storage_stats (
  workspace_id TEXT PRIMARY KEY, active_bytes INTEGER DEFAULT 0, trash_bytes INTEGER DEFAULT 0,
  version_bytes INTEGER DEFAULT 0, thumb_bytes INTEGER DEFAULT 0, updated_at INTEGER
);
-- 版本：copy-on-write；不与当前节点共用“原地覆盖”
CREATE TABLE file_versions (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, node_id TEXT NOT NULL,
  version_no INTEGER NOT NULL, r2_key TEXT NOT NULL, size INTEGER NOT NULL,
  sha256 TEXT, mime TEXT, created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
  expires_at INTEGER
);
CREATE UNIQUE INDEX idx_versions_no ON file_versions(node_id, version_no);
CREATE INDEX idx_versions_node ON file_versions(workspace_id, node_id, created_at DESC);
CREATE INDEX idx_versions_key ON file_versions(workspace_id, r2_key);
CREATE INDEX idx_versions_expire ON file_versions(workspace_id, expires_at) WHERE expires_at IS NOT NULL;
-- 分享下载审计；dedupe_key 防止 Range/下载管理器重复计数
CREATE TABLE share_downloads (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, share_id TEXT NOT NULL,
  ip_hash TEXT, ua_hash TEXT, dedupe_key TEXT, success INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_share_downloads ON share_downloads(share_id, created_at DESC);
CREATE UNIQUE INDEX idx_share_downloads_dedupe ON share_downloads(share_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
~~~

保留不变：`shares`（加 `workspace_id`、`max_downloads`、`downloads` 原子计数）、`uploads`（加 `idempotency_key`；`status` 扩为 `pending|completing|done|aborted`）、`orphan_objects`、`settings`（改 `(scope, key)` 主键）、`nodes_fts` 与其三个触发器。

既有表增量（清库重建时并入 4.1 DDL；旧库则 expand-contract）：
- `shares`：`workspace_id`、`max_downloads`、`last_download_at`、`revoked_at`；下载计数用原子 `UPDATE`，不要读改写。
- `uploads`：`workspace_id`、`idempotency_key`（唯一）、`status` 扩展、`updated_at`；7 天未完成由 R2 lifecycle + cron 清理。
- `share_downloads` 使用 4.1 DDL；`dedupe_key` 唯一索引防止 Range/下载管理器重复计数。

**计量口径**：`workspaces.used_bytes` 是配额真相（单条原子 `UPDATE ... WHERE used+?<=quota`）；`storage_stats.active/trash/version/thumb` 是解释性四分项，每次 mutation 同 batch 更新，cron 校准。配额按**逻辑字节**计（同一 sha256 的多个节点/版本各自计），R2 物理去重只影响成本，不影响用户配额；两者混用会导致“容量显示和账单对不上”。

必须先声明的硬阈值：**D1 单库 500MB / Free**。方案要求库体积达到 300MB（60%）告警、450MB（90%）进入拆分预案（升 Workers Paid 取更大库或按租户分库）——这条写进运维 runbook，不做事后补救。

**P1.1 已落地**：`sql/v2/schema.sql`（与 1.x `sql/schema.sql` 并存，切换与 P1.2–1.5 代码同提交）+ `scripts/validate-schema-v2.mjs`（`npm run check:schema`，node:sqlite 内存库执行全量 DDL，12 项断言全绿，且已纳入 `npm run check` 与 CI）。校验过程中确认了两条设计约束：

1. **`nodes` 刻意不设 `ON DELETE CASCADE`**：删除 workspace 会被外键挡住，必须先按应用流程清对象再删行。若加级联，D1 行会静默消失而 R2 对象变成无引用的孤儿——宁可报错，不可静默。根哨兵另有 `idx_nodes_root` 部分唯一索引保证每个 workspace 至多一行。
2. **软删不触发 FTS `delete`**（external content 的正常语义）：回收站里的文件名仍在索引中，因此**所有搜索查询必须 `join nodes` 并过滤 `deleted_at IS NULL`**，否则会搜出已删除文件。已写成断言，实现时不许绕过。

---

### 4.2 树模型：物化路径、闭包表与 D1 500MB

> **结论**：SaaS 版 1.0 仍以“邻接表 + 物化路径”为主模型，**不把闭包表作为主存储**。闭包表在“文件夹级权限继承、任意祖先查询、多父 DAG”上更优雅，但它与 SaaS 的两个硬约束冲突：D1 单库 500MB、每天 10 万行写入。若要闭包表，按 4.2.4 作为**按 workspace 可选的 ACL 读模型**引入，不替换主树；若评审要求闭包表主树，则 T1=B，按 4.2.4 迁移并接受 P1 +1–2 周与容量代价。

#### 4.2.1 当前模型与查询模式

当前 `nodes`（SaaS 化后）：

- `workspace_id` 是隔离前缀；`parent_id` 邻接表；`path` 是祖先 id 链（根 `/`，根子节点 `/{rootId}/`）。
- 子树前缀 `path || id || '/'`；范围 `path >= lo AND path < hi`。
- 索引 `(workspace_id, path)`、`(workspace_id, parent_id, is_dir DESC, name) WHERE deleted_at IS NULL`。
- 改名不改变路径；移动目录只改自身 `parent_id/path` + 子树 `path` 前缀（2 条 UPDATE）。

真实查询：

| 操作 | 实现 | 成本 | 频率 |
|---|---|---|---|
| 列目录 | `parent_id` + 覆盖索引 | O(子节点) | 极高 |
| 面包屑 | `path` 解析 + `id IN` | 1–2 查询 | 高 |
| 子树删除/移动 | `path` 范围 | 1 次范围扫描 | 中 |
| 移动目录 | 自身 + 子树 2 条 UPDATE | 2 条语句 | 中 |
| 搜索 | FTS5 trigram + `workspace_id` | 与树无关 | 高 |
| 回收站 | `deleted_at` 部分索引 | 有界 | 每日 |

#### 4.2.2 四种模型对比（按 SaaS 负载）

假设单 workspace 10 万节点、平均深度 8、最大深度 30；D1 Free 500MB/库、10 万行写/天。

| 模型 | 子树 | 祖先 | 移动 1 万节点子树 | 插入 | 10 万节点存储估算 | 结论 |
|---|---|---|---|---|---|---|
| 邻接表 + 递归 CTE | 递归 O(子树) | 递归 O(深度) | O(1) 改父 | O(1) | ~50MB（节点） | 仅对照 |
| **物化路径** | 1 次索引范围 | 解析 + 1 次 IN | **2 条 UPDATE，约 1 万行** | 1 行 | ~30MB 路径 + 节点 | **1.0 主模型** |
| 闭包表 | 1 次索引 + join | 1 次索引 | **约 8–16 万行删除+插入** | O(深度) | **~80–120MB 闭包行**，随深度线性涨 | 可选 ACL，不做主树 |
| 嵌套集 | 1 次范围 | 1 次范围 | 重编号 O(n) | 重编号 O(n) | ~节点 | 并发写灾难，否决 |

补充：

- 10 万节点、深度 8：闭包表约 90 万行；按 ~110B/行约 100MB；若 30 万节点则约 300MB，直接吃掉 D1 500MB 的大半。路径模型约 30MB，给 FTS/审计/版本留出空间。
- 移动 1 万节点、深度 8：闭包表约 8 万删除 + 8 万插入，接近一天写额度；路径模型约 1 万行，且 2 条语句。
- 文件夹级权限：1.0 只有 workspace membership，没有逐文件夹 ACL；路径前缀已够。闭包表不是 1.0 必需。
- 闭包表优势在“高频任意祖先查询/多父 DAG”；MStor 是单父文件树，移动是高频操作，路径更合适。

#### 4.2.3 物化路径实现规范（SaaS 版必须补齐）

**不变量**：

1. 根哨兵：`parent_id=''`、`name=''`、`path='/'`；每个 workspace 恰好一行。
2. 任意节点：`path = parent.path || parent.id || '/'`。
3. 子树前缀 `path || id || '/'`；所有后代 `path` 以它开头；用 `/` 分段，禁止字符串 `includes` 判断。
4. `path` 只含 `[0-9a-f-]` 与 `/`；最大深度 100（路径 <4KB）。
5. 所有正常读取必须 `deleted_at IS NULL` 且 `workspace_id = ?`；恢复/彻底删除用 `getNodeIncludingDeleted`。
6. 根哨兵不可删除/移动；目标父必须是活跃目录；不能移入自身子树。

**核心 SQL**：

```sql
-- 列目录
SELECT * FROM nodes
WHERE workspace_id = ?1 AND parent_id = ?2 AND deleted_at IS NULL
ORDER BY is_dir DESC, name
LIMIT ?3;

-- 子树（含自身）：拆两支，避免 OR 破坏 path 索引
SELECT id, r2_key FROM nodes
WHERE workspace_id = ?1 AND id = ?2
UNION ALL
SELECT id, r2_key FROM nodes
WHERE workspace_id = ?1 AND path >= ?3 AND path < ?4;
-- 自身 path 不以“自身子树前缀”开头，所以两支不会重复

-- 移动：自身 + 子树，同一 batch
UPDATE nodes SET parent_id=?1, name=?2, path=?3, updated_at=?4
WHERE id=?5 AND workspace_id=?6;

UPDATE nodes SET path=?1 || substr(path, ?2)
WHERE workspace_id=?3 AND path >= ?4 AND path < ?5;
-- ?1 = newSelfPath || node.id || '/'
-- ?2 = oldPrefix.length + 1（SQLite substr 1-based）
-- ?4/?5 = oldPrefix / oldPrefix || 'g'
```

**零查询判环**：目标父行已加载：

```ts
const isSelfOrDescendant =
  targetParentId === dir.id ||
  targetParent.path.split("/").filter(Boolean).includes(dir.id);
```

**边界**：

- 移动/删除根哨兵 → 400；目标父非活跃目录 → 404/400。
- 同名冲突排除自身，唯一索引兜底 409。
- 还原时父目录已删 → `409 PARENT_DELETED`，提示先恢复父目录。
- 软删除不改 `path`；彻底删除才移除行；恢复后路径仍有效（父未删）。
- **移动目录时子树 path UPDATE 必须包含已删除后代**（否则回收站里的后代路径漂移，恢复后落到错误父级）；列表/面包屑查询才过滤 `deleted_at`。
- 目录移动不改 `content_version`（内容未变），但 `updated_at` 可更新。

**路径漂移修复**（每日/每周有界）：

```sql
SELECT c.id, c.path, p.path AS parent_path, p.id AS parent_id
FROM nodes c JOIN nodes p ON c.parent_id = p.id
WHERE c.workspace_id = ?1 AND c.name != ''
  AND c.path != (p.path || p.id || '/')
LIMIT 100;
```

测试：10 万节点合成树，随机 create/move/rename/delete/restore，断言 `path` 不变量、无环、深度 ≤100。

#### 4.2.4 闭包表完整设计（可选，按 workspace 启用）

**DDL**：

```sql
CREATE TABLE node_closure (
  workspace_id TEXT NOT NULL,
  ancestor_id TEXT NOT NULL,
  descendant_id TEXT NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  PRIMARY KEY (workspace_id, ancestor_id, descendant_id)
) WITHOUT ROWID;
CREATE INDEX idx_closure_ancestor ON node_closure(workspace_id, ancestor_id, depth);
CREATE INDEX idx_closure_descendant ON node_closure(workspace_id, descendant_id, depth);
```

**插入节点**（父祖先 + 自身）：

```sql
INSERT INTO node_closure(workspace_id, ancestor_id, descendant_id, depth)
SELECT workspace_id, ancestor_id, ?newId, depth + 1
FROM node_closure
WHERE workspace_id = ?ws AND descendant_id = ?parentId
UNION ALL
SELECT ?ws, ?newId, ?newId, 0;
```

> 根哨兵必须先有自身行 `(workspace_id, rootId, rootId, 0)`；否则新节点/子树查询会缺根。建 workspace 时同步插入，回填时从根开始。

**移动子树**（`?id` → `?newParentId`）：

```sql
-- 删除子树到旧外部祖先的边；子树内部边保留
WITH sub AS (
  SELECT descendant_id, depth FROM node_closure
  WHERE workspace_id = ?ws AND ancestor_id = ?id
)
DELETE FROM node_closure
WHERE workspace_id = ?ws
  AND descendant_id IN (SELECT descendant_id FROM sub)
  AND ancestor_id NOT IN (SELECT descendant_id FROM sub);

-- 新祖先 × 子树；深度 = 新祖先深度 + 1 + 子树相对深度
WITH sub AS (
  SELECT descendant_id, depth FROM node_closure
  WHERE workspace_id = ?ws AND ancestor_id = ?id
),
newanc AS (
  SELECT ancestor_id, depth FROM node_closure
  WHERE workspace_id = ?ws AND descendant_id = ?newParentId
)
INSERT INTO node_closure(workspace_id, ancestor_id, descendant_id, depth)
SELECT ?ws, na.ancestor_id, s.descendant_id, na.depth + 1 + s.depth
FROM newanc na CROSS JOIN sub s;
```

- 两条语句尽量同一 D1 batch；CTE 不跨语句复用。batch 原子时失败会整体回滚；若因行数/子请求拆成多批，失败会留下“旧边已删、新边未写”的中间态，必须用任务表/影子表或先写新边再去重，不能裸跑。
- 复杂度 `O(|子树| × |新祖先链|)`；1 万节点、深度 8 约 8–16 万行，接近 D1 日写额，必须分批/异步。
- 删除：`DELETE FROM node_closure WHERE workspace_id=? AND descendant_id IN (子树)`；或 `ON DELETE CASCADE`。
- 查询：

```sql
-- 子树（不含自身）
SELECT descendant_id FROM node_closure
WHERE workspace_id = ?ws AND ancestor_id = ?id AND depth > 0;

-- 祖先（面包屑，根在前）
SELECT ancestor_id, depth FROM node_closure
WHERE workspace_id = ?ws AND descendant_id = ?id
ORDER BY depth DESC;
```

- 环检查：`SELECT 1 FROM node_closure WHERE workspace_id=? AND ancestor_id=?target AND descendant_id=?moving`。

**迁移/启用步骤**（虽然 D-b 可清库，仍要按此验证）：

1. 新建表，`closure_read=false`；主树仍走 path。
2. 从浅到深回填：每个节点插入自身 + 父祖先；每批 500 节点，记录进度。
3. 10 万节点、深度 8 约 90 万行；D1 Free 10 万行/天，至少分 9 天或临时 Workers Paid；不要在一个请求内做。
4. 影子读：同一批请求走 path/closure，比较结果；差异写审计。
5. 切读 → 切写（同一 batch 双写）→ 观察 2 周；保留 path 回滚。
6. 回滚：`closure_read=false`；确认无引用后删表。

**何时才启用**：

- 文件夹级继承权限成为 1.x 核心，且权限检查频率高到 path 前缀解析成为瓶颈。
- 引入多父/DAG（同一文件出现在多个虚拟目录）——已不是当前树模型。
- 单 workspace 节点数 <5 万、深度 <10，闭包行数可控，且愿意接受移动写放大。

否则保持 path；**不要为了“看起来更专业”而双写**。

#### 4.2.5 与 D1 500MB 的关系

- D1 Free 单库 500MB 是 SaaS 的硬顶；方案已有 300MB（60%）告警、450MB（90%）拆分预案。
- 闭包表会让库体积提前触顶：10 万节点深 8 约 +100MB，30 万节点约 +300MB；路径模型把空间留给 FTS、审计、版本元数据。
- 若 D-b 清库重建，建议先用 path 上线；把闭包表作为“ACL 功能开关 + workspace 级实验”，不要全量默认开启。
- 拆分预案（按租户分库/升 Paid）成本高；减少不必要的行是更便宜的扩容。

### 4.3 在线预览与 Range 协议

> 预览的目标：**大文件不整包下载、视频可拖动、PDF 可按页取、断点可恢复、错误可解释、任何类型都不执行恶意内容**。核心在服务端 HTTP 语义，不是前端弹窗。

#### 4.3.1 现状与差距

- `server/lib/serve.ts` 已有单段 Range、206、`Content-Range`、`ETag`、`Accept-Ranges`、`Content-Disposition`，HTML/SVG 强制 attachment。
- 缺：显式 `HEAD`、`If-Range`、`If-None-Match`/304、416 的 `Content-Range: bytes */size`、多段 Range 定义、零字节、版本化缓存。
- `ETag=node.id`，图片 `immutable` 一年但 URL 不带版本：内容替换后会命中旧图。
- PDF 用原生 iframe；无 PDF.js/页码/文本层；无 Office/CSV；文本无截断提示/编码处理；弹窗缺焦点陷阱。
- SaaS 还多一层：会话 Cookie、workspaceGuard、分享 token；预览必须复用同一授权，不能另开绕过路径。

#### 4.3.2 HTTP 合约（逐条测试）

| 请求 | 期望 |
|---|---|
| `GET` 无 Range | 200 全量，`Content-Length=size`，`Accept-Ranges: bytes`，ETag，Last-Modified |
| `Range: bytes=0-1023` | 206，`Content-Range: bytes 0-1023/size` |
| `Range: bytes=1024-` | 206 到末尾 |
| `Range: bytes=-1024` | 206 最后 1024；size<1024 取全部 |
| 起点 ≥ size | 416，`Content-Range: bytes */size`，无 body |
| 语法非法/多段 | 200 全量（忽略 Range；不要猜） |
| `HEAD` | 200 全量元数据，无 body；不读 R2 body（忽略 Range） |
| `If-None-Match` 命中 | 304，带 ETag/Cache-Control |
| `If-Modified-Since` 未改 | 304（无 If-None-Match 时） |
| `If-Range` 不匹配 | 200 全量（不是 206） |
| `Range` + `If-Range` 命中 | 206 |
| `size=0` | 200，`Content-Length=0`；Range → 416 `bytes */0` |
| 分享过期/撤销/密码错 | 403/404/401，不泄露对象存在性 |
| 下载次数用尽 | 410/429，带错误码，不返回内容 |
| `?v` 旧版本 | 版本仍保留 → 200 该版本；已清理 → 404 `VERSION_GONE` |

**条件头**：`If-None-Match` 支持 `*`/逗号列表（GET 弱比较），且优先于 `If-Modified-Since`；后者按秒比较 `updated_at`。`If-Range` 只接受强 ETag 或 HTTP-date；弱 ETag 视为不匹配。不要字符串全等糊弄。

#### 4.3.3 服务端实现

```ts
const size = node.size ?? 0;
const version = node.content_version ?? 1;
const etag = `"${node.id}-${version}"`;
const lastModified = new Date(node.updated_at).toUTCString();

if (ifNoneMatchMatches(req, etag)) {
  return new Response(null, { status: 304, headers: { etag, "cache-control": cacheControl } });
}
const parsed = parseRange(req.headers.get("range"), size);
if (parsed.kind === "unsatisfiable") {
  return new Response(null, {
    status: 416,
    headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes", etag },
  });
}
let range = parsed.kind === "valid" ? parsed : null;
const ifRange = req.headers.get("if-range");
if (range && ifRange && ifRange !== etag && ifRange !== lastModified) range = null;

if (method === "HEAD") {
  const head = await BUCKET.head(node.r2_key);
  if (!head) throw notFound();
  // node.size 为空或与 R2 不一致时，以 head.size 为准并告警
  return new Response(null, { status: 200, headers: headersFor(head.size, null) });
}

const obj = range
  ? await BUCKET.get(node.r2_key, { range: { offset: range.start, length: range.end - range.start + 1 } })
  : await BUCKET.get(node.r2_key);
if (!obj) throw notFound();
// 200 的 Content-Length 用 R2 实际大小；范围响应仍用节点 size 计算 Content-Range
const actualSize = obj.size ?? size;
return new Response(obj.body, { status: range ? 206 : 200, headers: headersFor(actualSize, range) });
```

> **大小不一致**：上传 complete 必须 `HeadObject` 校验并写回 `nodes.size`；历史不一致由校准任务修复。若请求时 R2 实际大小与 `nodes.size` 不同，宁可不发 `Content-Range`（回 200 或 500 + 告警），也不要发错范围。

**`parseRange` 规则**：

- 只接受单段 `^bytes=(\d*)-(\d*)$`（trim/lowercase）；含 `,` 视为多段 → 200。
- 语法非法（两端空、非数字、多段）→ 忽略 Range 返回 200；不要用 416 表达“看不懂”。
- 语法合法但不可满足（`bytes=-0`、起点 ≥ size、end<start）→ 416。
- 后缀 `-N`：`start=max(0,size-N)`；end 缺省 `size-1`；end 越界钳制。
- `Number.isSafeInteger`；超长/NaN → 200。
- size=0 且 Range 语法合法 → 416 `bytes */0`。

**响应头**：

```http
Accept-Ranges: bytes
ETag: "<id>-<content_version>"
Last-Modified: <updated_at>
Cache-Control: private, no-cache
Content-Disposition: inline; filename*=UTF-8''...
X-Content-Type-Options: nosniff
Cross-Origin-Resource-Policy: same-origin
# 仅 HTML/SVG/XHTML 加；PDF/媒体不要加，避免原生查看器被 sandbox 破坏
Content-Security-Policy: sandbox
```

- 私有内容默认 `private, no-cache` + ETag 304；URL 带 `?v=<content_version>` 且匹配才 `private, max-age=31536000, immutable`。
- 缩略图 key 不可变 → `private, max-age=31536000, immutable`；仍带 ETag。
- Range 响应加 `Cache-Control: no-transform`，防止中间层压缩/改写字节范围；不要给 Range 加 `Content-Encoding`。
- 可执行内容（HTML/SVG/XHTML）一律 `attachment` + `CSP: sandbox`；PDF 不要走原生插件假设，P2 用 PDF.js 并禁用 PDF 内脚本（`isEvalSupported:false`）；P1 原生 iframe 必须做浏览器矩阵，不能渲染就降级下载。
- 版本解析：`?v` 匹配当前 → 当前对象；不匹配查 `file_versions`，命中 → 该版本，未命中 → `404 VERSION_GONE`；不要用当前内容冒充旧版本。

**端点面**：

| 端点 | 方法 | 查询参数 | 授权/说明 |
|---|---|---|---|
| `/api/files/:id/content` | `GET/HEAD` | `dl=1`、`v=<content_version>`、`version=<version_no>` | session + workspaceGuard；`version` 只读 |
| `/api/files/:id/thumb` | `GET/HEAD` | `v=<thumb_key>` | session + workspaceGuard；不可变缓存 |
| `/api/s/:token/content` | `GET/HEAD` | `dl=1` | 分享 token + 密码/过期/上限；Range 不计数 |
| `/api/files/:id/versions` | `GET` | 游标 | session + workspaceGuard；不返回 R2 key |
| `/api/files/:id/versions/:vid/restore` | `POST` | — | 生成新当前版本；审计 |

前端 `contentUrl()` 改为显式选项（`dl`/`v`/`version`），缩略图用 `thumbUrl(id, thumbKey)`；不要让调用方手拼 query。

#### 4.3.4 预览矩阵

| 类型 | 1.0/1.x 方案 | 关键技术 | 降级 |
|---|---|---|---|
| 图片 | `<img>` + 灯箱 | 缩略图、EXIF Orientation、`?v` | SVG 下载；HEIC 不支持则下载 |
| 视频 | `<video preload=metadata playsInline>` | Range 拖动、海报、`canPlayType` | MOV/HEVC 仅 Safari；MKV 下载 |
| 音频 | `<audio controls>` | Range | 不支持则下载 |
| PDF | P1 原生 iframe；P2 PDF.js | Range、worker、cMap、密码 | >100MB 提示下载 |
| 文本/JSON | `<pre>` + 高亮 | 前 1MB Range、编码 | >2MB 截断 |
| Markdown | 渲染 + 消毒 | `react-markdown` + `rehype-sanitize` | 禁 raw HTML/外链图 |
| CSV | 表格 | 前 200 行/50 列 | 大文件下载 |
| DOCX/XLSX | P2 客户端 | docx-preview/DOMPurify、SheetJS | >20MB/5k 行下载 |
| PPTX/旧 Office | 下载 | 无可靠免费渲染 | 明确提示 |
| ZIP | 1.x 列目录 | Range 中央目录 | 1.0 下载 |

#### 4.3.5 PDF / 视频 / 图片 / 文本

- **PDF.js（P2）**：懒加载；`getDocument({ url, withCredentials:true, rangeChunkSize:262144, disableAutoFetch:true, cMapUrl, cMapPacked:true })`；只渲染当前页 ±1；worker 同源；关闭 `pdfDoc.destroy()`；密码不写日志；CSP `worker-src 'self' blob:`，是否需 `wasm-unsafe-eval` 用真实构建回归。
- **视频**：不要 `fetch`/Blob 预下载；直接 `src` 让浏览器发 Range；`preload=metadata`；`poster=thumb`；`playsInline`；编码不支持时提示下载/转码。不做服务端转码。
- **图片**：网格只加载 320px WebP 缩略图，`loading=lazy`/`decoding=async`/固定宽高防 CLS；灯箱原图 + 缩放/旋转/键盘；SVG 不内联。
- **文本**：前 1MB + 截断提示；日志可看结尾 `bytes=-1048576`；UTF-8/BOM/替换字符；代码高亮按需；Markdown 禁 raw HTML；CSV 限行/列；不 `innerHTML` 渲染用户文本。
- **Office**：DOCX `docx-preview` + DOMPurify、禁外链；XLSX SheetJS 只读、限 5k 行/50 列、禁宏；PPTX/旧格式下载；全部客户端解析，不上传第三方。

#### 4.3.6 安全与 UX

- 私有内容：session/workspaceGuard，所有查询带 `workspace_id`；分享内容：token + 密码/过期/上限，独立限流；不能拿分享 token 读其他节点。
- `Content-Disposition`：HTML/SVG/XHTML attachment；文件名 RFC 5987；拒绝 CR/LF。
- 预览弹窗：`role="dialog" aria-modal="true" aria-labelledby`；焦点入内/Tab 循环/关闭恢复；背景 `inert`；移动端下滑关闭/双指缩放；`prefers-reduced-motion` 取消动画。
- 加载/错误：骨架、进度、重试 + 下载；不支持编码/超大文件给明确下一步；不要只显示“加载失败”。
- 分享页：无下载权限隐藏按钮，但不承诺防截图（不是 DRM）。

#### 4.3.7 性能、成本与测试

- 一次普通预览：session/workspace D1 + node D1 + R2 GET ≈ 3–4 子请求；Range 不增加 D1。
- 100 图网格：100 个缩略图请求（约 300 子请求总量）；虚拟列表 + lazy，家庭/小团队仍远低于 10 万/天。
- 视频 seek：每次 1 个 Range；1GB 视频 10–50 次；分享页限流防滥用。只接受单段 Range，多段回 200，避免 206 放大攻击。
- PDF.js/Office/高亮各自独立 chunk；首屏 JS ≤250KB gzip；SW 只缓存 shell，不缓存私有媒体/Range。
- 测试：`parseRange` 20+ 表驱动；Miniflare 字节比对 sha256；206/416/304/HEAD；Chrome/Safari/Firefox + iOS/Android；MP4 seek、PDF 翻页、图片缩放、文本截断；axe + 键盘；HTML/SVG 上传后必须 attachment。

### 4.4 其余关键链路

| 链路 | 设计要点 | 验收 |
|---|---|---|
| **上传/续传** | `init → presign → PUT parts → complete`；`Idempotency-Key`；16–32 预签名/请求；ETag 校验；配额预扣/释放；7 天未完成自动中止 | 1GB 上传 5–7 个 Worker 请求；断网续传；重复 init/complete 不双份 |
| **认证/准入** | Access（GitHub IdP）边缘登录 + jose 验签（iss/aud/RS256 + 边缘防伪）；应用侧只做 membership 准入与邀请令牌；CSRF 双头同源沿用 | 无 token/伪造/停用 → 401/403；有身份无 membership → 引导页；跨站写 403 |
| **租户隔离** | `workspaceGuard` 注入 `workspace_id + role`；查询层不接受裸 id；分享/上传同样校验 | IDOR 负例：A 拿 B 的 node/share/upload 全 404 |
| **分享/下载** | token 128-bit；密码 100k + 限流；`max_downloads` 原子 UPDATE；Range/预览不计数；`dl=1` 首次计数；撤销即时失效 | 并发 10 次 max=1 只成功一次；拖动进度条不耗尽次数 |
| **搜索** | 1–2 字符前缀 LIKE + LIMIT；≥3 字符 FTS5 trigram；`workspace_id` 过滤；游标分页；bm25/高亮 | 10 万节点短搜索 ≤200 行/查询；EXPLAIN 无全表扫 |
| **版本** | copy-on-write；`version_no`/`content_version`；文档 3 版/30 天、媒体 1 版；版本计入配额；过期有界清理 | 替换可回滚；版本对象不被孤儿误删；恢复生成新版本 |
| **缓存** | `?v=content_version`；ETag/304；缩略图 immutable；私有内容不进公共缓存；分享 no-store；SW 只缓存 shell | 重复预览 304；替换后不显示旧图；撤销后缓存不继续提供 |
| **D1 500MB** | 300MB 告警/450MB 拆分预案；审计归档；版本/闭包行计入体积；不无界增长 | 月度体积报表；达到阈值有 runbook |

#### 4.4.1 上传状态机与断点续传

```text
queued → init(pending) → uploading parts → completing → done
                    ↘ paused/error → resume（只补缺失分片）
                    ↘ aborted（释放配额/中止 multipart）
```

- `uploads.idempotency_key` 唯一（workspace + user 维度）；重复 init 返回同一会话，不产生第二个 R2 multipart。
- init 校验父目录/名称/配额，按声明 size **预扣** workspace 配额；abort/失败释放，complete 按 `HeadObject` 实测大小确认并修正。
- 客户端分片直传 R2（16MB/片），每 16–32 片批量取预签名 URL；ETag 存 IndexedDB，刷新后续传只补缺失分片。
- complete 提交 `{partNumber, etag}`；服务端校验 R2 实测 size/ETag；插入节点与版本；删除会话；重复 complete 幂等返回已有节点。
- 7 天未完成 → R2 lifecycle 中止 + cron 清会话；孤儿 multipart 不得计入用户配额。
- **验收**：1GB 文件 5–7 个 Worker 请求；断网/刷新/重复请求可恢复；声明 size 偏小不能绕过配额。

#### 4.4.2 分享下载：原子计数与 Range 语义

```sql
UPDATE shares
SET downloads = downloads + 1, last_download_at = ?1
WHERE id = ?2 AND workspace_id = ?3
  AND revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at > ?1)
  AND (max_downloads IS NULL OR downloads < max_downloads);
-- meta.changes = 0 → 410/429，不返回内容
```

- 只在 `dl=1` 的“下载意图”计数；`Range`/预览/HEAD 不计。同一 `share_id + ip_hash + ua_hash` 10 分钟内只计一次（`share_downloads.dedupe_key` 唯一）。
- 密码 PBKDF2 100k + 恒定时间比较；单 IP 限流 + 分享级失败锁定；密码最少 8 位。
- 撤销/过期每次请求校验；分享内容 `Cache-Control: private, no-store`，撤销立即生效。
- **验收**：并发 10 次 `max_downloads=1` 只成功一次；拖动视频进度条不耗尽次数；撤销后立即 410。

#### 4.4.3 搜索：短查询不走 `%q%`

- **检索范围锁定为文件名**（D-g）：不建 content 表，不做 PDF/Office 文本抽取，不做 OCR/正文检索；以下全部只针对 `nodes.name`。
- 1–2 字符：`name LIKE ? || '%'` 前缀 + `LIMIT 20`，UI 提示「前缀匹配；输入 3 个字符可做子串匹配」；索引 `(workspace_id, name)`。
- ≥3 字符：FTS5 trigram `MATCH` + `workspace_id` 过滤 + `LIMIT 100` + 游标；`bm25` 排序、`snippet()` 高亮。
- 输入长度 ≤100；转义 `%`/`_`；不要把用户输入拼进 FTS 语法；空查询返回最近/收藏，不扫全表。
- 过滤（类型/时间/大小/分享）走索引；避免 `OR` 导致全表扫描；必要时拆分查询再合并。
- **验收**：10 万节点、100 次短搜索/天 ≤200 行/查询；`EXPLAIN QUERY PLAN` 无全表扫描。

#### 4.4.4 版本与缓存：copy-on-write + 版本化 URL

- 替换文件 → 新 R2 key + `file_versions(version_no=max+1)`；旧 key 保留；`nodes.r2_key` 指向新对象，`content_version++`。
- 版本对象与当前对象同 sha256 时可共享 key；配额按逻辑大小计；孤儿清扫必须同时查 `nodes.r2_key`、`file_versions.r2_key`、`nodes.thumb_key`。
- 文档默认 3 版/30 天，媒体 1 版；`expires_at` 由策略计算；cron 有界清理 + 宽限期二次引用检查。
- 恢复版本：把旧版本提升为新当前版本（生成新版本行），不删除历史；审计 `version_restore`。
- 缓存：`?v=content_version` + ETag；私有内容 `no-cache`，匹配 `v` 才 immutable；缩略图 key 不可变；分享 `no-store`；SW 只缓存 shell。
- **验收**：连续替换可回滚；版本过期不误删当前对象；替换后旧 URL 不显示新内容。

#### 4.4.5 身份、CSRF 与 CSP（Access 模型下）

- 身份：Access 边缘登录并注入 `Cf-Access-Jwt-Assertion`；Worker 内 jose 验签 `iss`/`aud`/`RS256`、强制 `exp`，`sub` 为空（service token）一律拒绝——现有 `access.ts` 逻辑沿用。
- 准入：验签通过 ≠ 有权限。`workspaceGuard` 用 membership 注入 `workspace_id/role`；查询层禁止裸 `id` 跨 workspace；无 membership 渲染「等待管理员邀请」引导页。
- 会话过期：沿用 `/auth/renew` 定向导航 + 10s 续期守卫 + SW 导航豁免（已修过白屏，不要重写）；登出跳 `/cdn-cgi/access/logout`。
- CSRF：写请求校验 `Origin`/`Sec-Fetch-Site` 同源（现有 `csrfGuard`），缺失头放行非浏览器客户端；媒体 GET 不额外校验，但必须过 workspace/分享授权。
- CSP：P3 定稿时不需要 Turnstile 例外；但必须放行 Access 登录/续期所需的 `https://<team>.cloudflareaccess.com`（`connect-src`），否则登录与续期会被 CSP 打断。
- **验收**：缺 token / 伪造 / 停用用户 → 401/403；有身份无 membership → 引导页；跨站写 403；IDOR 负例全 404；清 Access cookie 后 `/auth/renew` 走通且不循环刷新。

## 5. 分期计划

### P0 · 安全网与基线（1 周）
| # | 交付 | 验收 |
|---|---|---|
| 0.1 | CI 修分支：`branches: [main, master]`；`check` 加 `format:check` | push 到 master 出现 Actions 运行且绿 |
| 0.2 | 本机跑通 `npm test` 并记录基线（330 用例真伪） | 数字落表；红用例单独登记 |
| 0.3 | ErrorBoundary + 路由 `errorElement`（`App.tsx`） | 渲染抛错显示降级页而非白屏；RTL 用例 |
| 0.4 | 端点子请求/CPU 基线（计数器 + Workers Logs 实测） | 每端点有基线数字；最坏输入可复现 |
| 0.5 | **Access + GitHub 实测**：接 GitHub IdP 后解码一次真实 JWT，记录 `sub`/`email` 形态与 GitHub 组织策略是否生效 | 邀请匹配口径定稿（按 sub 还是按 email） |
| 0.6 | 删死代码（`errors.rateLimited`）、补 `docs/README.md` 索引 | lint 零告警 |

### P1 · 租户化与成员准入（2 周；认证沿用 Access，不重写）
| # | 交付 | 验收 |
|---|---|---|
| 1.1 | schema 2.0 + 清库重建脚本 + `sql/schema.sql` 与 migrations 归零对齐 | `schema-parity` 测试绿；空库一键建 |
| 1.2 | 成员准入：邀请令牌 → 用户经 Access(GitHub) 首登按 `access_sub` 落 membership；`platform_admin` 与 workspace 角色正交 | 有身份无 membership → 引导页而非 500；`platform_admin` 不越权读写他人 workspace |
| 1.3 | 双重簿记治理：管理台「未绑定成员」视图 + 审计事件 + 邀请撤销/过期/单次消费 | Zero Trust 放行但应用无 membership 的用户被显式识别并告警 |
| 1.4 | 限流：分享口令与上传 init 的 IP 维度限流（登录面已由 Access 承担，不做登录限流/验证码） | 分享口令爆破 20 次后 429 |
| 1.5 | `workspaceGuard`：`(workspace_id, role)` 注入 + 全部查询带 workspace 条件 | **IDOR 负例矩阵**：A 用户拿 B 的 node/share/upload id 全部 404，无一例外 |
| 1.6 | 规则收敛：`data/d1.ts`（`chunk`/`placeholders`/`isUniqueViolation`）、`data/quota.ts`（单一记账入口）、`domain/` 收口树不变量 | grep 验收：routes 层零分片字面量、零 UNIQUE 字符串判断 |
| 1.7 | 数据安全修复：`getLiveNode`/`requireLiveDir` 语义收紧；multipart 按 R2 实测大小记账 | 已删节点不可写入/下载/分享；声明 size 偏小时按实测记账 |
| 1.8 | 契约层：`shared/contract/` 类型 + 边界校验，客户端 `api/types.ts` 改为引用 | 驼峰/下划线混用清零；改字段只改一处 |
| 1.9 | 预览协议基础：显式 `HEAD`、`If-Range`、`If-None-Match/304`、416 `bytes */size`、`content_version` ETag、版本解析 | Range 合约测试全绿；视频 seek/PDF 按页不整包下载；旧 `?v` 不冒充当前内容 |

### P2 · 商业级 1.0 功能（5–6 周）
存储治理与成本中心（四分项计量 + 全局预算 + 507 拒绝）→ 全局上传中心（AppShell 级队列 + IndexedDB 续传 + 幂等键）→ 分享 2.0（下载上限、一次性、审计、限流）→ 版本（`file_versions` + copy-on-write + 恢复 + `content_version`）→ 文件名检索 2.0（前缀 LIKE + FTS + 服务端过滤 + 游标分页 + 高亮；不做内容检索）→ 收藏/最近/标签 → 复制/撤销（8–30s Snackbar）→ 管理台（用户/存储/设置/审计/健康）→ 通知 → 缩略图与预览矩阵（客户端 WebP + PDF.js 按需 chunk + DOCX/XLSX 客户端预览 + Range/HEAD/ETag 消费端）。
退出标准：每项验收通过；预算不超（每请求 ≤40 子请求）；无 P0 缺陷。

### P3 · 质量、合规与发布（3–4 周）
WCAG 2.2 AA 审计与修复（零 critical/serious）→ CWV 与代码分割（首屏 ≤250KB gzip）→ CSP/HSTS 安全头（含 Access 域名的 `connect-src` 例外）→ 备份/恢复演练（D1 Time Travel 恢复到新库并跑通）→ 账户导出（客户端流式 ZIP）与删号（30 天宽限）→ 隐私/条款 → staging smoke + 发布 + 回滚演练。

### 1.x（不在本次范围）
Stripe 订阅与用量计量、团队成员协作细化、WebDAV/API Token、i18n、相册/时间线、评论、**内容检索（正文/OCR/向量，1.x 后再评估）**。

---

## 6. 验收与质量门禁
- 每次合并：`npm test`（服务端 Miniflare 真实 D1/R2 + 客户端 jsdom）全绿；`npm run check` 零告警；`npm run build` 成功。
- 每阶段：IDOR 负例矩阵、Range/HEAD/ETag 协议矩阵、批量 1/49/50/100/500 项、配额边界（拒绝后 R2 无残留）、回收站到期、分享撤销即时生效。
- 树模型：10 万节点合成树随机 create/move/rename/delete/restore；断言 `path = parent.path || parent.id || '/'`、无环、深度 ≤100、面包屑正确；若 T1=闭包表，另测 9 万行回填/移动 1 万节点写预算。
- 预览：`parseRange` 20+ 表驱动、Miniflare 字节比对 sha256、206/416/304/HEAD、MP4 seek/PDF 按页/文本截断；HTML/SVG 上传后必须 attachment。
- 发布前：staging 手工漫游清单（注册→验证→邀请→上传三通道→分享→搜索→版本→回收站→删号）+ Lighthouse/axe 基线对比。
- 成本：每端点子请求 ≤ 预算表；cron 逐任务 ≤40；超限即视为缺陷而不是"以后优化"。

## 7. 风险与回滚
| 风险 | 严重度 | 缓解 |
|---|---|---|
| 双重簿记错配（Access 放行但无 membership / 反之） | 高 | 引导页 + 审计事件 + 管理台「未绑定成员」视图；拉人清单进 runbook |
| GitHub 私有邮箱导致邀请匹配失败 | 中 | P0 实测 JWT 声明；必要时邀请改「用户主动认领 + 管理员确认」 |
| IDOR（多租户最常见事故） | 高 | `workspaceGuard` 强制注入 + 负例矩阵作为门禁；查询层不接受"裸 id" |
| D1 单库 500MB | 中 | 300MB 告警、450MB 拆分预案；元数据瘦身（审计分表/归档） |
| 闭包表主树导致体积/写入失控 | 中/高 | 1.0 默认物化路径；闭包表仅 workspace 级 ACL 实验；回填/移动按 §4.2.4 分批并先做影子读 |
| Range/缓存语义错误（旧图、拖动失败） | 中/高 | `content_version` + ETag；HEAD/If-Range/304/416 合约测试；浏览器矩阵 |
| PDF.js/Office 包体或 CSP 回归 | 中/中 | 懒加载独立 chunk；CSP 实测；失败降级原生/下载 |
| Access 50 用户上限被撞到 | 中 | 45 用户告警；超限改 Access 付费或回自建认证（v2.0 A1，+3 周） |
| 邀请令牌被猜中或被转发 | 中 | 令牌 128-bit + 单次消费 + 过期 + 审计；邀请只对已通过 Access 的身份生效 |
| 无迁移的代价 | 低（已选 D-b） | 现网仅测试数据；上线前确认 D1/R2 里确实无家庭文件，否则回退到迁移方案 |
| 平台额度政策变动 | 中 | Phase 0 先把额度与计费基线写成数字，季度复核 |

## 8. 里程碑汇总
| 阶段 | 内容 | 预估 | 累计 |
|---|---|---|---|
| P0 | 安全网与基线 | 1 周 | 1 周 |
| P1 | 租户化与成员准入（Access 沿用） | 2 周 | 3 周 |
| P2 | 商业级 1.0 功能 | 5–6 周 | 8–9 周 |
| P3 | 质量/合规/发布 | 3 周 | 11–12 周 |
| 缓冲 | 15–20% | — | **约 13–15 周** |

> 若 T1 改选闭包表主树，或 T2 把 PDF.js/Office 提前到 P1，P1 需 +1–2 周；若改回自建认证（超 50 用户或要自助注册），P1 +3 周。以上限重估，不要压缩隔离测试。

## 9. 待确认（按推荐值执行中，任一条可单独推翻）
0. **本轮已拍板**：认证=保留 Access + GitHub（D-f）；检索=仅文件名（D-g）；树模型=物化路径（D-h）；用户规模 ≤50（D-i）。
1. **A1 成员准入**：邀请令牌 + 管理员确认（推荐）vs 只在 Zero Trust 控制台开通、应用内无邀请。
2. **A2 计费**：1.0 不含支付（推荐）vs 1.0 接 Stripe。
3. **A3 隔离**：单库 `workspace_id`（推荐）vs 每租户独立库。
4. **邀请匹配口径**：按 `access_sub`（推荐，稳定）vs 按 email（直观但依赖 GitHub 邮箱可见性）。
5. **T1 树模型**：物化路径主树（推荐，§4.2 已论证）vs 闭包表主树（+1–2 周，D1 体积/写放大）。
6. **Access 策略口径**：GitHub 组织作准入选择器（推荐）vs 邮箱白名单逐个添加——决定「拉人」是改控制台还是改代码。

> 未答即按推荐推进；推翻任一条只影响上表对应行，不回滚已完成的 P0。
