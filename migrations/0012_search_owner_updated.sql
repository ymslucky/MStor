-- 短查询（<3 字符）LIKE 子串搜索优化：
-- search 路由的短查询走 `owner_id = ? AND deleted_at IS NULL AND name LIKE '%x%' ORDER BY updated_at DESC`，
-- 无合适索引时按 owner 全树扫描再排序。此部分索引覆盖等值过滤 + 排序键，避免 TEMP B-TREE。
CREATE INDEX IF NOT EXISTS idx_nodes_owner_updated
  ON nodes(owner_id, updated_at DESC) WHERE deleted_at IS NULL;