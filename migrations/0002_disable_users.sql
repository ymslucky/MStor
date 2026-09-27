-- 用户停用：admin 可停用/启用账号；停用后登录与既有会话均被拒绝
ALTER TABLE users ADD COLUMN disabled_at INTEGER;
