-- 0019: 注册审核（个人云盘）
-- 新注册用户可先建号但不分配空间；管理员审核通过后才允许使用。
ALTER TABLE users ADD COLUMN approved_at INTEGER;
UPDATE users SET approved_at = created_at WHERE approved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_pending ON users(approved_at) WHERE approved_at IS NULL;
