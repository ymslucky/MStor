-- 修复 0008 回填缺陷：0008 的递归 CTE 种子只含根哨兵行，而顶层节点 parent_id 约定为 ''
-- （不是哨兵 id），导致 JOIN 关联不上、全表 path 停留在默认值 '/'。
-- 正确格式：哨兵行 '/'；顶层节点 '/' || 哨兵id || '/'；更深节点 '{父path}{父id}/'。
-- 幂等：重复执行只是把 path 重算一遍。
WITH RECURSIVE down(id, path) AS (
  SELECT n.id, '/' || s.id || '/'
  FROM nodes n JOIN nodes s
    ON s.owner_id = n.owner_id AND s.parent_id = '' AND s.name = ''
  WHERE n.parent_id = '' AND n.name != ''
  UNION ALL
  SELECT n.id, d.path || d.id || '/' FROM nodes n JOIN down d ON n.parent_id = d.id
)
UPDATE nodes SET path = (SELECT d.path FROM down d WHERE d.id = nodes.id)
WHERE id IN (SELECT id FROM down);
