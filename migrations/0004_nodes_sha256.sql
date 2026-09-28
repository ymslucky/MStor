-- 秒传：记录文件内容 SHA-256，同 hash 同 size 的文件直接复用已有 R2 对象
ALTER TABLE nodes ADD COLUMN sha256 TEXT;
CREATE INDEX idx_nodes_sha256 ON nodes(sha256);
