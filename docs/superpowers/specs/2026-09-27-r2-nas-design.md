# R2 NAS（家庭云盘）设计文档

日期：2026-09-27
状态：已与用户对齐，待实现

## 1. 背景与目标

基于 Cloudflare R2 构建一个面向家庭/朋友小团队的私有云盘（NAS）网站，移动端通过响应式 PWA 覆盖。

**目标用户**：家庭/朋友小团队（多用户，独立空间）。
**核心诉求**：零运维、免出口流量费、成本趋近于零、移动端可用。
**大陆访问速度**：明确"能用就行"，不为速度引入额外架构复杂度。

## 2. 需求范围

### MVP 包含

- 基础文件管理：浏览（文件夹树）、上传、下载、删除、重命名、新建文件夹
- 在线预览：图片、视频/音频（Range 流式）、PDF、文本
- 外部分享链接：带有效期、可选提取码、可撤销，访问者无需登录
- 回收站：软删除 + 恢复 + 彻底删除 + 30 天自动清理
- 搜索：按文件名全文检索（D1 FTS5）
- 多用户与权限：独立空间隔离 + admin 全局视图；OIDC 对接自建 IAM（auth.msxor.com）
- WebDAV 网关：`/dav/`，支持 Windows 映射驱动器 / macOS Finder / iOS 文件 App
- 移动端：响应式 Web + PWA（可添加到主屏幕）

### 明确不做（MVP 之外）

- Samba/SMB 协议（Cloudflare Workers 仅支持 HTTP/WebSocket，技术不可行；由 WebDAV 替代覆盖）
- 原生 App、微信小程序
- 秒传/内容去重
- 图片缩略图服务（MVP 用原图懒加载，出口免费）
- 运营分析面板（后续可用 Pipelines + R2 SQL 扩展，见 §11）

## 3. 架构方案（已选定：方案 A 单体 Worker）

对比过的备选：方案 B（Pages 前端 + API Worker 前后端分离，全预签名上传）、方案 C（Fork OpenList/AList 类开源改造）。选定 A 的理由：家庭规模下复杂度最低、单部署单元、绑定调用免密钥、免费额度内零成本。

```
┌─────────────┐     ┌────────────────── Worker (Hono) ─────────────────┐
│ 浏览器/PWA   │────▶│ /api/*     REST API（文件/分享/搜索/回收站）        │──▶ R2（文件存储）
│ WebDAV客户端 │────▶│ /dav/*     WebDAV 网关（Basic Auth + 应用密码）     │──▶ D1（元数据/索引）
└─────────────┘     │ /s/{token} 公开分享页                              │──▶ auth.msxor.com（OIDC）
                    └──────────────────────────────────────────────────┘
```

## 4. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| Runtime | Cloudflare Workers（单体） | 免运维、边缘网络 |
| 后端框架 | Hono + TypeScript | CF 生态事实标准 |
| 前端 | React + Vite + TailwindCSS + vite-plugin-pwa | 生态成熟，PWA 一套代码覆盖移动端 |
| 前端数据层 | TanStack Query | 服务端状态缓存/失效/重试，减少样板代码（已确认） |
| 文件存储 | R2 binding | 免出口流量费 |
| 元数据 | D1（SQLite） | 文件树/回收站/搜索/分享，OLTP 点操作 |
| 大文件直传 | aws4fetch 动态签发 S3 presigned URL | 绕开 Worker 请求体限制 |
| 认证 | OIDC 授权码 + PKCE → 自签 session JWT | 对接 auth.msxor.com |
| 密码哈希 | PBKDF2-SHA256（Web Crypto） | Workers 无原生 bcrypt |

## 5. 数据模型

### 关键决策：R2 key 用节点 ID，不用人类可读路径

```
R2 key: {userId}/{nodeId}
```

重命名/移动只改 D1 记录，R2 对象零拷贝；路径由 `nodes` 表 `parent_id` 树表达。

### D1 表结构

```sql
users   (id, oidc_sub UNIQUE, name, role,            -- 'admin' | 'member'
         webdav_password_hash,                        -- WebDAV 专用应用密码
         quota_bytes, created_at)                     -- 默认配额取 env DEFAULT_QUOTA_BYTES（默认 10GB，admin 可改）

nodes   (id, owner_id, parent_id, name, is_dir,
         r2_key,                                      -- 目录为 NULL
         size, mime, created_at, updated_at,
         deleted_at)                                  -- NULL=正常；非空=回收站
         -- UNIQUE(owner_id, parent_id, name)

shares  (id, node_id, token UNIQUE, password_hash,    -- 可选提取码
         expires_at, created_at, revoked_at)

uploads (id, owner_id, parent_id, name, size,
         r2_key, r2_upload_id, status,                -- 分片上传会话
         created_at)

-- 搜索：FTS5 虚表 nodes_fts(name)
```

## 6. 认证与权限

- **OIDC 流程**：`/auth/login` 302 到 auth.msxor.com（授权码 + PKCE）→ `/auth/callback` 换 token → upsert `users` → 签发 session JWT（HttpOnly、Secure、SameSite=Lax，7 天）
- **角色**：首个登录用户自动成为 admin；此后按 IAM role claim 映射
- **member**：所有查询强制注入 `owner_id = 自己`（物理隔离）
- **admin**：可切换任意用户空间、管理配额/停用
- **WebDAV**：Basic Auth（用户名 + 应用密码，PBKDF2 校验，设置页生成/重置）
- **分享访问者**：仅 `/s/{token}`，无需登录

## 7. 核心流程

### 7.1 上传（双通道）

- **小文件 ≤ 60MB**：`PUT /api/files` → Worker 纯流式 `request.body` → `R2.put()` → 写 D1（不落内存）
- **大文件 > 60MB（预签名分片直传，数据不经 Worker）**：
  1. `POST /api/uploads/init` → D1 登记 uploads + CreateMultipartUpload
  2. Worker 签发 N 个 presigned PUT URL（分片 8~64MB）
  3. 前端 3 并发直传 R2 S3 endpoint（ListParts 支持断点续传）
  4. `POST /api/uploads/complete` → CompleteMultipartUpload → 写 D1 nodes
- 配套：R2 bucket 配 CORS（允许站点域名 PUT）；R2 S3 凭证存 Secrets
- 失败处理：分片失败自动重试 3 次（指数退避），超限标记可手动重传

### 7.2 下载与在线预览

- `GET /api/files/:id/content?disposition=inline|attachment` → `R2.get(key, {range})` 流式响应，支持 Range（视频拖动进度条）
- 预览：图片原图懒加载；视频/音频 `<video>`；PDF iframe；文本截断前 1MB
- 缩略图 MVP 用原图（出口免费）

### 7.3 外部分享

- `POST /api/shares` → 128bit token → `/s/{token}`；可选提取码（PBKDF2-SHA256）、有效期、撤销（`revoked_at`）
- 文件夹分享：访问者可浏览子树
- 下载经 Worker 代理流式转发，R2 不暴露，统计下载次数

### 7.4 回收站

- 删除 = 子树 `deleted_at` 打时间戳（`WITH RECURSIVE` 收集 + `batch()` 事务）
- 恢复：清时间戳；父目录已删则落回根目录
- 彻底删除才真正删 R2 对象
- Cron Trigger 每日清理删除超 30 天节点

### 7.5 搜索

- FTS5 按文件名检索，前端 300ms 防抖即搜，结果带面包屑路径

### 7.6 WebDAV（`/dav/`）

- 方法映射：`PROPFIND`（Depth 0/1，拼 207 XML）/ `GET`（含 Range）/ `PUT`（流式）/ `MKCOL` / `MOVE` / `COPY` / `DELETE`；`LOCK`/`UNLOCK` 返回假成功（Windows 必需）
- 限制：WebDAV 上传经 Worker，受请求体上限约束（免费版 100MB）；超大文件走网页端分片直传

## 8. 错误处理

- 统一错误格式：`{ "error": { "code": "QUOTA_EXCEEDED", "message": "..." } }`；Hono `onError` 兜底 500
- 前端：TanStack Query 全局错误 toast；401 跳登录
- 树操作用 D1 `batch()` 保证原子性
- 配额：init 上传时校验 `SUM(size) + 新文件 > quota_bytes` 拒绝（403）

## 9. 测试策略

| 层 | 工具 | 覆盖点 |
|---|---|---|
| 后端集成 | `@cloudflare/vitest-pool-workers`（Miniflare 模拟 R2/D1） | 上传双通道、回收站恢复、权限隔离、分享有效期 |
| 后端单元 | Vitest | 路径解析、DAV XML 生成、PBKDF2 校验 |
| OIDC | Mock token endpoint | 登录回调、首用户提升 admin |
| WebDAV | 集成测试 + 真机冒烟（Windows 映射驱动器、iOS 文件 App） | PROPFIND/PUT/GET/LOCK |
| 前端 | Vitest + Testing Library | 文件树、上传队列、移动端断点 |

## 10. 部署与配置

```yaml
wrangler.jsonc:
  assets:    PWA 构建产物（Worker 直接托管，单域名）
  r2_buckets: NAS bucket binding
  d1:        元数据库 binding
  triggers:  cron 每日清理回收站
  vars:      OIDC_ISSUER=https://auth.msxor.com, CLIENT_ID, REDIRECT_URI
  secrets:   OIDC_CLIENT_SECRET / SESSION_SECRET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
```

- 部署：`npm run build && wrangler deploy`（后续可加 GitHub Actions）
- 域名：`nas.msxor.com`（CNAME）
- 前端直传 CORS：R2 bucket 允许站点域名 PUT

## 11. 后续扩展（本期不做）

- 缩略图：Cloudflare Image Resizing
- 运营分析：Worker 事件 → Pipelines → Iceberg 表 → R2 SQL 聚合（谁下载最多、存储趋势、分享访问统计）。已评估：R2 SQL 是面向 Iceberg 表的 OLAP 引擎（beta），不适合替代 D1 做元数据管理，仅适合此分析场景
- 秒传/去重、大容量优化、优选 IP 加速

## 12. 成本预估（家庭规模）

| 项 | 免费额度 | 超出 |
|---|---|---|
| Workers | 10 万请求/天 | $5/月（付费版请求体上限提升至 500MB） |
| R2 存储 | 10 GB | ~$0.015/GB/月 |
| R2 操作 | Class A 100 万/月、Class B 1000 万/月 | 极难超出 |
| D1 | 5 GB + 500 万行读/天 | 家庭场景用不完 |
| 流量 | 出口永久免费 | — |

典型家庭使用（几十 GB）月成本 ≈ $0~1。
