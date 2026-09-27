export interface UserRow {
  id: string;
  oidc_sub: string;
  name: string;
  role: "admin" | "member";
  webdav_password_hash: string | null;
  quota_bytes: number;
  created_at: number;
}

export interface NodeRow {
  id: string;
  owner_id: string;
  parent_id: string; // "" = 用户根目录哨兵值
  name: string;
  is_dir: 0 | 1;
  r2_key: string | null;
  size: number | null;
  mime: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface ShareRow {
  id: string;
  node_id: string;
  token: string;
  password_hash: string | null;
  expires_at: number | null;
  downloads: number;
  created_at: number;
  revoked_at: number | null;
}

export interface UploadRow {
  id: string;
  owner_id: string;
  parent_id: string;
  name: string;
  size: number;
  r2_key: string;
  r2_upload_id: string;
  status: "pending" | "done";
  created_at: number;
}
