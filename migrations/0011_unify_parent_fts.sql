-- 0011：nodes 整表重建，一次性清理三项遗留债
-- R1 parent_id 统一：顶层节点 parent_id 由 '' 改为根哨兵行 id（哨兵行自身保持 ''），
--    消灭 parentIdOf / 「parent_id='' 且 name=''」等哨兵特判
-- R2 回收站不占名：去掉表级 UNIQUE(owner_id,parent_id,name)（软删行挡名），
--    改部分唯一索引 idx_nodes_name_active（仅活跃行唯一），childByName 同步过滤 deleted_at
-- R3 FTS 外部化：nodes_fts 改 external content（content='nodes'），行 rowid 直接绑定 nodes.rowid，
--    删除 nodes.fts_rowid 列与回写 UPDATE（FTS 与主表数据永不失配）
--
-- 注意：DROP TABLE nodes 会因 FK 级联隐式 DELETE shares（shares.node_id REFERENCES nodes）。
-- 节点 id 在重建后保持不变，故先备份 shares、重建后原样写回，行数与内容零损失。

PRAGMA defer_foreign_keys = ON;

-- 1. 旧 FTS 触发器引用 fts_rowid，必须先摘除
DROP TRIGGER IF EXISTS nodes_ai;
DROP TRIGGER IF EXISTS nodes_au;
DROP TRIGGER IF EXISTS nodes_ad;
DROP TABLE IF EXISTS nodes_fts;

-- 2. shares 备份（无 FK 的普通表，躲过 DROP nodes 的级联删除）
CREATE TABLE shares_bak AS SELECT * FROM shares;

-- 3. 重建 nodes：列集合不变（少 fts_rowid），无表级 UNIQUE
CREATE TABLE nodes_new (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '/',
  name TEXT NOT NULL,
  is_dir INTEGER NOT NULL CHECK (is_dir IN (0,1)),
  r2_key TEXT,
  size INTEGER,
  mime TEXT,
  sha256 TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- 4. 数据拷贝：顶层节点（parent_id='' 且有名字）改挂根哨兵行；哨兵行自身保持 ''
INSERT INTO nodes_new
SELECT id, owner_id,
  CASE WHEN parent_id = '' AND name != ''
       THEN COALESCE((SELECT s.id FROM nodes s WHERE s.owner_id = nodes.owner_id AND s.parent_id = '' AND s.name = '' LIMIT 1), '')
       ELSE parent_id END,
  path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at
FROM nodes;

DROP TABLE nodes;
ALTER TABLE nodes_new RENAME TO nodes;

-- 5. 重建索引（与 schema.sql 一致）+ 新部分唯一索引（活跃行才占名）
CREATE INDEX idx_nodes_owner_deleted ON nodes(owner_id, deleted_at);
CREATE INDEX idx_nodes_listing ON nodes(owner_id, parent_id, is_dir DESC, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_sha256 ON nodes(sha256);
CREATE INDEX idx_nodes_path ON nodes(owner_id, path);
CREATE INDEX idx_nodes_r2key ON nodes(r2_key);
CREATE INDEX idx_nodes_trash ON nodes(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE UNIQUE INDEX idx_nodes_name_active ON nodes(owner_id, parent_id, name) WHERE deleted_at IS NULL;

-- 6. 写回 shares（DROP nodes 若触发级联删除，此处恢复；未触发则为幂等往返）
DELETE FROM shares;
INSERT INTO shares SELECT * FROM shares_bak;
DROP TABLE shares_bak;

-- 7. FTS 外部化：rowid 即 nodes.rowid，触发器 O(1) 同步，无需 node_id/fts_rowid
CREATE VIRTUAL TABLE nodes_fts USING fts5(name, content = 'nodes', content_rowid = 'rowid', tokenize = 'trigram');
INSERT INTO nodes_fts(nodes_fts) VALUES('rebuild');
-- rebuild 会把目录行（含根哨兵 name=''）也写入 FTS，与触发器「仅文件入索引」语义不一致，清掉
DELETE FROM nodes_fts WHERE rowid IN (SELECT rowid FROM nodes WHERE is_dir = 1);

-- 触发器同步：外部内容表删除/改名必须用 'delete' 命令并显式提供旧值
-- （DELETE ... WHERE rowid=? 会让 FTS 回查 content 表取「旧值」，但主表此时已变，索引会残留）
CREATE TRIGGER nodes_ai AFTER INSERT ON nodes
WHEN new.is_dir = 0
BEGIN
  INSERT INTO nodes_fts(rowid, name) VALUES (new.rowid, new.name);
END;
CREATE TRIGGER nodes_ad AFTER DELETE ON nodes
WHEN old.is_dir = 0
BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
END;
CREATE TRIGGER nodes_au AFTER UPDATE OF name ON nodes
WHEN new.is_dir = 0
BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
  INSERT INTO nodes_fts(rowid, name) VALUES (new.rowid, new.name);
END;
