-- 0016：多租户重建（清库策略，方案 D-b：现网仅测试数据）
-- 与 sql/schema.sql（2.0）等价；schema-parity 测试会双向校验，改动需同步。
DROP TABLE IF EXISTS nodes_fts;
DROP TABLE IF EXISTS shares;
DROP TABLE IF EXISTS uploads;
DROP TABLE IF EXISTS nodes;
DROP TABLE IF EXISTS orphan_objects;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS users;
-- ============================================================
-- MStor Schema 2.0（多租户 + Access 身份 + 物化路径）
-- 清库重建用：npx wrangler d1 execute mstor --remote --file=sql/v2/schema.sql
-- 与 sql/schema.sql（1.x 单租户）并存，切换在 P1.2–P1.5 代码改造的同一提交里完成，
-- 在此之前 master 仍以 1.x schema 为准（保持可部署）。
-- 校验：npm run check:schema（node:sqlite 内存库执行全量 DDL + 不变量断言）
-- ============================================================

-- 身份：认证由 Cloudflare Access（GitHub IdP）在边缘承担，access_sub = JWT sub 为唯一锚点；
-- 不自建密码与会话。email 仅作展示与邀请匹配（GitHub 私有邮箱时可为 NULL）。
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  access_sub TEXT NOT NULL UNIQUE,
  email TEXT,
  access_bound_at INTEGER,
  name TEXT NOT NULL,
  platform_admin INTEGER NOT NULL DEFAULT 0 CHECK (platform_admin IN (0,1)),
  disabled_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- 租户：workspaces.used_bytes 是配额真相（单条原子 UPDATE 校验），storage_stats 是解释性四分项
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  quota_bytes INTEGER NOT NULL,
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  created_at INTEGER NOT NULL
);

-- 成员：platform_admin 与 workspace 角色正交；一个用户可属多个 workspace
CREATE TABLE IF NOT EXISTS memberships (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);

-- 邀请：令牌只存 sha256；经 Access 首登认领，单次消费。不发事务邮件。
CREATE TABLE IF NOT EXISTS invitations (
  token_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_invitations_pending ON invitations(workspace_id, expires_at) WHERE accepted_at IS NULL;

-- 文件树：邻接表(parent_id) + 物化路径(path=祖先 id 链)，隔离维度 workspace_id 置于索引前缀。
-- 根哨兵行：每个 workspace 恰好一行（parent_id='' AND name=''），由部分唯一索引保证。
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_by TEXT REFERENCES users(id),        -- 根哨兵行无作者（NULL），真实节点必填
  parent_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '/',
  name TEXT NOT NULL,
  is_dir INTEGER NOT NULL CHECK (is_dir IN (0,1)),
  r2_key TEXT,
  size INTEGER,
  mime TEXT,
  sha256 TEXT,
  content_version INTEGER NOT NULL DEFAULT 1,
  thumb_key TEXT,
  width INTEGER,
  height INTEGER,
  taken_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_root ON nodes(workspace_id) WHERE parent_id = '' AND name = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_name_active ON nodes(workspace_id, parent_id, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_listing ON nodes(workspace_id, parent_id, is_dir DESC, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(workspace_id, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(workspace_id, path);
CREATE INDEX IF NOT EXISTS idx_nodes_sha ON nodes(workspace_id, sha256);
CREATE INDEX IF NOT EXISTS idx_nodes_r2key ON nodes(r2_key);
CREATE INDEX IF NOT EXISTS idx_nodes_trash ON nodes(workspace_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_thumb ON nodes(workspace_id, thumb_key) WHERE thumb_key IS NOT NULL;

-- 分享：token 外部可见；max_downloads 由原子 UPDATE 扣减；撤销即 revoked_at
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  expires_at INTEGER,
  max_downloads INTEGER,
  downloads INTEGER NOT NULL DEFAULT 0,
  last_download_at INTEGER,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_shares_node ON shares(node_id);
CREATE INDEX IF NOT EXISTS idx_shares_active ON shares(workspace_id, created_at DESC) WHERE revoked_at IS NULL;

-- 分享下载明细：dedupe_key 防 Range/下载管理器重复计数
CREATE TABLE IF NOT EXISTS share_downloads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  share_id TEXT NOT NULL,
  ip_hash TEXT,
  ua_hash TEXT,
  dedupe_key TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_share_downloads ON share_downloads(share_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_downloads_dedupe ON share_downloads(share_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- 分片上传会话：idempotency_key 防重复 init 产生第二个 R2 multipart
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  owner_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT,
  r2_key TEXT NOT NULL,
  r2_upload_id TEXT NOT NULL,
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completing','done','aborted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_uploads_idem ON uploads(workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uploads_open ON uploads(status, created_at) WHERE status IN ('pending','completing');

-- 版本：copy-on-write；不与当前节点原地覆盖
CREATE TABLE IF NOT EXISTS file_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT,
  mime TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_no ON file_versions(node_id, version_no);
CREATE INDEX IF NOT EXISTS idx_versions_node ON file_versions(workspace_id, node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_versions_key ON file_versions(workspace_id, r2_key);
CREATE INDEX IF NOT EXISTS idx_versions_expire ON file_versions(workspace_id, expires_at) WHERE expires_at IS NOT NULL;

-- 审计：与业务写同 batch 落库
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  meta TEXT,
  request_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_ws_time ON audit_events(workspace_id, created_at DESC);

-- 存储四分项（解释性；配额真相在 workspaces.used_bytes）
CREATE TABLE IF NOT EXISTS storage_stats (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  active_bytes INTEGER NOT NULL DEFAULT 0,
  trash_bytes INTEGER NOT NULL DEFAULT 0,
  version_bytes INTEGER NOT NULL DEFAULT 0,
  thumb_bytes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);

-- 动态配置：scope = 'global' 或 workspace id
CREATE TABLE IF NOT EXISTS settings (
  scope TEXT NOT NULL DEFAULT 'global',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (scope, key)
);

-- 孤儿 R2 对象登记表：彻底删除时登记候选 key，延迟复查引用后清扫（规避秒传 TOCTOU）
CREATE TABLE IF NOT EXISTS orphan_objects (
  r2_key TEXT PRIMARY KEY,
  workspace_id TEXT,
  queued_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orphan_queued ON orphan_objects(queued_at);

-- 文件名检索：FTS5 trigram 子串匹配；external content 让 rowid 直连 nodes，触发器 O(1) 同步。
-- 范围锁定为「仅文件名」（不做正文抽取）；目录名同样入索引（搜索文件夹是常态）。
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(name, content = 'nodes', content_rowid = 'rowid', tokenize = 'trigram');
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes
BEGIN
  INSERT INTO nodes_fts(rowid, name) VALUES (new.rowid, new.name);
END;
CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes
BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
END;
CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE OF name ON nodes
BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
  INSERT INTO nodes_fts(rowid, name) VALUES (new.rowid, new.name);
END;
