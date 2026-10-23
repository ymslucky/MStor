-- 0021: 个人云盘不再支持邀请/共享空间，删除邀请表
DROP INDEX IF EXISTS idx_invitations_pending;
DROP TABLE IF EXISTS invitations;
