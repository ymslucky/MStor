-- 分享列表查询（shares.ts）：活跃分享按创建时间倒序。
-- 部分有序索引让 planner 以 shares 为驱动表（SCAN 有序索引 + nodes PK 探测），
-- 避免旧计划以 nodes 的 owner 索引全扫该用户所有行再逐行探 shares。
CREATE INDEX IF NOT EXISTS idx_shares_active ON shares(created_at DESC) WHERE revoked_at IS NULL;
