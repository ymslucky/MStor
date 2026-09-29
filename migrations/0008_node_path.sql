-- 物化路径：nodes 增加 path 列 = 祖先 id 链（不含自身）。
-- 格式：根哨兵行 '/'；根的直接子节点 '/{rootId}/'；更深节点 '{父path}{父id}/'。
-- 节点 X 的子树前缀 = X.path || X.id || '/'，子树查询/批量改路径用
-- `WHERE owner_id = ? AND path LIKE '{prefix}%'`（id 为 UUID，无 LIKE 特殊字符，无需转义）。
-- 目的：消除目录树操作（面包屑/子树删除/移动/恢复/搜索路径）的递归 CTE，
-- 全部退化为一次索引查询或一条 UPDATE，降低 D1 行读取费用。
ALTER TABLE nodes ADD COLUMN path TEXT NOT NULL DEFAULT '/';

-- 一次性回填：自根哨兵逐层展开（成本 = 全表一遍）；索引在回填后建，避免逐行维护
WITH RECURSIVE down(id, path) AS (
  -- 顶层节点（parent_id=''）的父是同 owner 的根哨兵行：path = '/' || 哨兵id || '/'
  SELECT n.id, '/' || s.id || '/'
  FROM nodes n JOIN nodes s
    ON s.owner_id = n.owner_id AND s.parent_id = '' AND s.name = ''
  WHERE n.parent_id = '' AND n.name != ''
  UNION ALL
  SELECT n.id, d.path || d.id || '/' FROM nodes n JOIN down d ON n.parent_id = d.id
)
UPDATE nodes SET path = (SELECT d.path FROM down d WHERE d.id = nodes.id)
WHERE id IN (SELECT id FROM down);

CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(owner_id, path);
