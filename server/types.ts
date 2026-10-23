export interface UserRow {
  id: string;
  access_sub: string; // Cloudflare Access JWT sub（GitHub 身份下同样稳定）
  email: string | null; // 展示与邀请匹配；GitHub 私有邮箱时可为 NULL
  access_bound_at: number | null; // 首次完成 Access 身份绑定时间
  approved_at: number | null; // 注册审核通过时间；NULL = 待审核
  name: string;
  platform_admin: 0 | 1; // 与 workspace 角色正交：只用于跨空间管理与排障
  created_at: number;
  disabled_at: number | null;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string | null;
  quota_bytes: number;
  used_bytes: number;
  created_at: number;
}

export type WorkspaceRole = "owner" | "admin" | "member";

export interface NodeRow {
  id: string;
  workspace_id: string; // 隔离维度：所有查询必须携带
  created_by: string | null; // 根哨兵行为 NULL
  parent_id: string; // 根哨兵行 id（哨兵行自身为 ''）
  path: string; // 物化祖先 id 链（不含自身）：'/{rootId}/{dirId}/'；子树前缀 = path + id + '/'
  name: string;
  is_dir: 0 | 1;
  r2_key: string | null;
  size: number | null;
  mime: string | null;
  sha256: string | null;
  content_version: number;
  thumb_key: string | null;
  width: number | null;
  height: number | null;
  taken_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface ShareRow {
  id: string;
  workspace_id: string;
  node_id: string;
  token: string;
  password_hash: string | null;
  expires_at: number | null;
  max_downloads: number | null;
  downloads: number;
  last_download_at: number | null;
  created_at: number;
  revoked_at: number | null;
}

export interface UploadRow {
  id: string;
  workspace_id: string;
  owner_id: string; // 发起上传的用户（审计用）
  parent_id: string;
  name: string;
  size: number;
  mime: string | null;
  r2_key: string;
  r2_upload_id: string;
  idempotency_key: string | null;
  status: "pending" | "completing" | "done" | "aborted";
  created_at: number;
  updated_at: number;
}
