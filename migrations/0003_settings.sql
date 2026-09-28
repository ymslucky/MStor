-- 动态配置表：admin 设置页可调整的键值对（目前 trash_retention_days，白名单校验在应用层）
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
