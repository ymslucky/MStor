-- 0020: 分享提取码暴力尝试限流
CREATE TABLE IF NOT EXISTS share_auth_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  blocked_until INTEGER
);
CREATE INDEX IF NOT EXISTS idx_share_auth_window ON share_auth_attempts(window_start);
