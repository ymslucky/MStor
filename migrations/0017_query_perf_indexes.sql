-- 0017: D1 读取行数优化——为高频查询补排序/覆盖索引
-- 生产 7d insights 中，membership 鉴权、审计流、最近访问、目录树、收藏都存在
-- "排序临时 B-tree" 或 "先按 workspace 扫再过滤" 的放大读取。
-- 索引只增加读优化，不改变任何业务语义。

-- 鉴权：WHERE user_id ORDER BY created_at；覆盖 role/workspace_id，避免回表与临时排序
CREATE INDEX IF NOT EXISTS idx_memberships_user_created
  ON memberships(user_id, created_at, workspace_id, role);

-- 成员列表：WHERE workspace_id ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_memberships_workspace_created
  ON memberships(workspace_id, created_at);

-- 平台审计流：无 workspace 过滤，按时间倒序取最近 N 条
CREATE INDEX IF NOT EXISTS idx_audit_created
  ON audit_events(created_at DESC);

-- 最近访问：workspace + user 前缀，viewed_at 倒序；替代仅 user_id 的旧索引
CREATE INDEX IF NOT EXISTS idx_node_views_workspace_user_time
  ON node_views(workspace_id, user_id, viewed_at DESC);

-- 收藏：workspace + user 前缀，created_at 倒序
CREATE INDEX IF NOT EXISTS idx_favorites_workspace_user_time
  ON favorites(workspace_id, user_id, created_at DESC);

-- 目录树：只索引活跃目录，ORDER BY path/name 不再扫全部节点
CREATE INDEX IF NOT EXISTS idx_nodes_dirs_tree
  ON nodes(workspace_id, path, name)
  WHERE is_dir = 1 AND deleted_at IS NULL AND name <> '';
