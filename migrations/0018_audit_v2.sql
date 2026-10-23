-- 0018: 审计事件模型 v2
-- 增加分类/结果/严重级/上下文/资源字段；旧数据按 action 前缀回填。
ALTER TABLE audit_events ADD COLUMN category TEXT NOT NULL DEFAULT 'security';
ALTER TABLE audit_events ADD COLUMN result TEXT NOT NULL DEFAULT 'success';
ALTER TABLE audit_events ADD COLUMN severity TEXT NOT NULL DEFAULT 'info';
ALTER TABLE audit_events ADD COLUMN actor_ip_hash TEXT;
ALTER TABLE audit_events ADD COLUMN actor_ua TEXT;
ALTER TABLE audit_events ADD COLUMN resource_type TEXT;
ALTER TABLE audit_events ADD COLUMN resource_id TEXT;

UPDATE audit_events
SET
  category = CASE
    WHEN action = 'admin.act_as' THEN 'security'
    WHEN action LIKE 'admin.%' THEN 'admin'
    WHEN action LIKE 'invitation.%' THEN 'member'
    WHEN action LIKE 'share.%' THEN 'share'
    WHEN action LIKE 'node.%' THEN 'file'
    ELSE 'security'
  END,
  severity = CASE
    WHEN action = 'admin.act_as' THEN 'critical'
    WHEN action LIKE 'admin.%' OR action LIKE 'share.%' OR action LIKE 'node.%' THEN 'warn'
    ELSE 'info'
  END;

CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON audit_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_category_time ON audit_events(category, created_at DESC);
