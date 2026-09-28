-- SQL 审计补充索引（消除剩余全表扫描点）：
-- 1) R2 引用计数：彻底删除时每个对象查一次剩余引用，无索引=每次全表扫
CREATE INDEX IF NOT EXISTS idx_nodes_r2key ON nodes(r2_key);
-- 2) 回收站过期 cron：deleted_at 是 idx_nodes_owner_deleted 第二列无 owner 前缀用不上，
--    部分索引让每日清理只扫回收站行
CREATE INDEX IF NOT EXISTS idx_nodes_trash ON nodes(deleted_at) WHERE deleted_at IS NOT NULL;
-- 3) WebDAV Basic auth 每请求按 name 查用户
CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);
