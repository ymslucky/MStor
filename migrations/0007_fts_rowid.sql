-- FTS 触发器 O(1) 化：nodes_fts.node_id 是 UNINDEXED 列无法建索引，
-- 旧触发器删除/重命名时 `DELETE FROM nodes_fts WHERE node_id = ?` 全表扫 FTS，
-- 文件数增长后成本线性恶化（10 万文件删 1 个 = 扫 10 万行）。
-- 方案：nodes 增加 fts_rowid 列，FTS 行的 rowid 与之绑定，触发器按 rowid 主键定位。
ALTER TABLE nodes ADD COLUMN fts_rowid INTEGER;

-- 一次性重建 FTS：nodes.rowid 作 FTS rowid（回填成本 = 一次全表扫描 + 每文件 1 插入）
DELETE FROM nodes_fts;
INSERT INTO nodes_fts(rowid, node_id, name)
  SELECT rowid, id, name FROM nodes WHERE is_dir = 0;
UPDATE nodes SET fts_rowid = rowid WHERE is_dir = 0;

-- 替换三个触发器（SQLite 无 CREATE OR REPLACE，先 DROP）
DROP TRIGGER IF EXISTS nodes_ai;
DROP TRIGGER IF EXISTS nodes_ad;
DROP TRIGGER IF EXISTS nodes_au;

-- 新建文件：分配 FTS rowid = MAX+1，并回写 nodes.fts_rowid（不触碰 name，不会递归触发 nodes_au）
CREATE TRIGGER nodes_ai AFTER INSERT ON nodes
WHEN new.is_dir = 0
BEGIN
  INSERT INTO nodes_fts(rowid, node_id, name)
    VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM nodes_fts), new.id, new.name);
  UPDATE nodes SET fts_rowid = (SELECT MAX(rowid) FROM nodes_fts) WHERE id = new.id;
END;

-- 删除文件：按 rowid 主键定位，O(1)。fts_rowid 为 NULL（目录/历史遗留）时跳过
CREATE TRIGGER nodes_ad AFTER DELETE ON nodes
WHEN old.fts_rowid IS NOT NULL
BEGIN
  DELETE FROM nodes_fts WHERE rowid = old.fts_rowid;
END;

-- 重命名：按 rowid 删除旧行、复用同一 rowid 插入新名（fts_rowid 不变）
CREATE TRIGGER nodes_au AFTER UPDATE OF name ON nodes
WHEN new.fts_rowid IS NOT NULL
BEGIN
  DELETE FROM nodes_fts WHERE rowid = new.fts_rowid;
  INSERT INTO nodes_fts(rowid, node_id, name) VALUES (new.fts_rowid, new.id, new.name);
END;
