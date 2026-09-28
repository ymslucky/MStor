-- D1 rows_read 优化：
-- 1) users.used_bytes 冗余配额列，O(1) 读取替代每次 SUM(size) 全表扫描（此前 990 万行/天）
-- 2) 目录列表专用部分索引，修复查询计划器误选 idx_nodes_owner_deleted 导致列一个目录扫全用户树（480 万行/天）
ALTER TABLE users ADD COLUMN used_bytes INTEGER NOT NULL DEFAULT 0;

-- 存量数据回填：按当前语义统计（软删除不计入配额）
UPDATE users SET used_bytes = (
  SELECT COALESCE(SUM(size), 0) FROM nodes
  WHERE nodes.owner_id = users.id AND deleted_at IS NULL
);

-- 覆盖 listDir 的等值过滤 + 排序（is_dir DESC, name），仅索引活跃行
CREATE INDEX IF NOT EXISTS idx_nodes_listing
  ON nodes(owner_id, parent_id, is_dir DESC, name) WHERE deleted_at IS NULL;
