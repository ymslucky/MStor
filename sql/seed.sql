-- ============================================================
-- MStor 初始数据（DML）
-- 建库后执行一次（幂等，INSERT OR IGNORE）：
--   npx wrangler d1 execute mstor --remote --file=sql/seed.sql
-- ============================================================

-- 动态配置默认值（admin 设置页可改，改后立即生效无需重新部署）
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('trash_retention_days', '30');   -- 回收站保留天数
