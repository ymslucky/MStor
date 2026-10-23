-- 0022: 密码分享的短会话（用于匿名大文件直链下载）
CREATE TABLE IF NOT EXISTS share_sessions (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_share_sessions_expires ON share_sessions(expires_at);
