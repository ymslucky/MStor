-- 0015: 认证切换 Cloudflare Access——身份列 oidc_sub → access_sub，新增 email 绑定锚点
-- 存量用户迁移期由管理员回填 email，Access 首登按 email 锚定原账号（见 lib/users.ts bindOrProvision）
ALTER TABLE users RENAME COLUMN oidc_sub TO access_sub;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN access_bound_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
