export interface Node {
  id: string;
  parent_id: string;
  name: string;
  is_dir: 0 | 1;
  size: number | null;
  mime: string | null;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
}

export interface ListFilesResult {
  nodes: Node[];
  breadcrumb: Node[];
  rootId: string;
}

export interface Me {
  id: string;
  name: string;
  role: "admin" | "member";
  quotaBytes: number;
  usedBytes: number;
  /** 回收站保留天数（动态配置，随设置页变更） */
  trashRetentionDays: number;
  /** 会话原始用户（登录账号）：admin act-as 查看他人空间时，与上方字段（当前空间用户）不同 */
  self: { id: string; name: string; role: "admin" | "member" };
}

export interface AdminUser {
  id: string;
  name: string;
  role: "admin" | "member";
  quota_bytes: number;
  created_at: number;
  disabled_at: number | null;
}

export interface Share {
  id: string;
  node_id: string;
  token: string;
  expires_at: number | null;
  downloads: number;
  created_at: number;
  node_name: string;
  node_is_dir: 0 | 1;
  node_size: number | null;
}

export interface PublicNode {
  id: string;
  name: string;
  isDir: boolean;
  size: number | null;
  mime: string | null;
}

export interface ShareInfo {
  id: string;
  name: string;
  isDir: boolean;
  size: number | null;
  mime: string | null;
  hasPassword: boolean;
  expiresAt: number | null;
  children?: PublicNode[];
}

export interface SearchResult {
  nodes: Node[];
  paths: Record<string, string>;
}

export interface TrashResult {
  nodes: Node[];
}

export interface InitUpload {
  uploadId: string;
  partSize: number;
}
