-- 孤儿 R2 对象登记表：彻底删除节点时登记候选 key，由定时任务延迟复查引用后清扫，
-- 规避「删行后立即删对象」与并发秒传「查到 key 后才插行」之间的 TOCTOU 悬空引用。
CREATE TABLE IF NOT EXISTS orphan_objects (
  r2_key TEXT PRIMARY KEY,
  queued_at INTEGER NOT NULL
);