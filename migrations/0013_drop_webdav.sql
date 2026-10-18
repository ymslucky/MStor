-- 移除 WebDAV 功能：删除 users.webdav_password_hash 列
-- SQLite 3.35+ 支持 DROP COLUMN（D1 已支持）；该列无索引、无触发器引用
ALTER TABLE users DROP COLUMN webdav_password_hash;