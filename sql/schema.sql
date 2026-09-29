-- ============================================================
-- MStor 数据库 Schema（DDL 全量版）
-- 由 migrations/0001-0011 合并而成，用于全新环境一次性建库：
--   npx wrangler d1 execute mstor --remote --file=sql/schema.sql
-- 既有环境请继续使用 migrations 增量迁移（wrangler d1 migrations apply），
-- 两者表结构等价，勿混用导致重复执行。
-- ============================================================

-- 用户：OIDC 登录账号；admin 可停用（disabled_at）
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  oidc_sub TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  webdav_password_hash TEXT,
  quota_bytes INTEGER NOT NULL,
  used_bytes INTEGER NOT NULL DEFAULT 0,         -- 冗余配额统计（写入点同步增减，cron 每日校准），避免每次 SUM 全表扫描
  disabled_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);

-- 文件树节点：根目录为哨兵行（parent_id='' AND name=''），所有顶层节点 parent_id = 哨兵行 id
-- path = 物化祖先 id 链（不含自身）：根 '/'，根子节点 '/{rootId}/'，更深 '{父path}{父id}/'；
-- 子树前缀 = path || id || '/'，子树查询/批量改路径用 path 区间扫描
-- 名称唯一性由部分唯一索引 idx_nodes_name_active 保证（仅活跃行，回收站不占名）
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '/',
  name TEXT NOT NULL,
  is_dir INTEGER NOT NULL CHECK (is_dir IN (0,1)),
  r2_key TEXT,
  size INTEGER,
  mime TEXT,
  sha256 TEXT,                                   -- 秒传：文件内容 SHA-256（≤60MB 直传时写入）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER                             -- 回收站：软删除时间戳
);
CREATE INDEX IF NOT EXISTS idx_nodes_owner_deleted ON nodes(owner_id, deleted_at);
-- 目录列表专用部分索引：等值过滤 + ORDER BY is_dir DESC, name 全覆盖，仅索引活跃行
CREATE INDEX IF NOT EXISTS idx_nodes_listing
  ON nodes(owner_id, parent_id, is_dir DESC, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_sha256 ON nodes(sha256);
CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(owner_id, path);          -- 物化路径：子树 LIKE 前缀扫描
CREATE INDEX IF NOT EXISTS idx_nodes_r2key ON nodes(r2_key);          -- R2 引用计数（purge 零引用判断）
CREATE INDEX IF NOT EXISTS idx_nodes_trash ON nodes(deleted_at) WHERE deleted_at IS NOT NULL; -- 回收站过期 cron
-- 名称唯一：仅活跃行（回收站不占名）
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_name_active
  ON nodes(owner_id, parent_id, name) WHERE deleted_at IS NULL;

-- 分享链接：token 外部可见；password_hash 提取码；revoked_at 撤销
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  expires_at INTEGER,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_shares_node ON shares(node_id);
CREATE INDEX IF NOT EXISTS idx_shares_active ON shares(created_at DESC) WHERE revoked_at IS NULL; -- 分享列表有序扫描

-- multipart 上传会话：init 落库（pending），complete 置 done
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  r2_upload_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  created_at INTEGER NOT NULL
);

-- 动态配置：admin 设置页键值对（白名单校验在应用层）
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 文件名全文检索（trigram 分词，支持子串匹配）
-- external content：FTS 行 rowid 即 nodes.rowid，触发器 O(1) 同步，无需额外映射列
-- 全新环境无存量数据，rebuild 不可用；目录行不靠触发器入索引，天然与上方语义一致
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(name, content = 'nodes', content_rowid = 'rowid', tokenize = 'trigram');
-- 触发器同步：外部内容表删除/改名必须用 'delete' 命令并显式提供旧值
-- （DELETE ... WHERE rowid=? 会让 FTS 回查 content 表取「旧值」，但主表此时已变，索引会残留）
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes
WHEN new.is_dir = 0
BEGIN
  INSERT INTO nodes_fts(rowid, name) VALUES (new.rowid, new.name);
END;
CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes
WHEN old.is_dir = 0
BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
END;
CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE OF name ON nodes
WHEN new.is_dir = 0
BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
  INSERT INTO nodes_fts(rowid, name) VALUES (new.rowid, new.name);
END;
