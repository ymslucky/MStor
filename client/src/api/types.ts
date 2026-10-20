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
  /** 缩略图 key（客户端生成 WebP 后上传；为 null 表示没有缩略图） */
  thumb_key?: string | null;
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
  /** 服务端下发的上传限制（小文件直传上限 / 分片大小）；旧响应缺失时前端回退默认值 */
  limits?: { smallFileLimit: number; partSize: number };
  /** 存储四分项与水位（服务端 /api/me.storage） */
  storage?: {
    activeBytes: number;
    trashBytes: number;
    usedBytes: number;
    quotaBytes: number;
    level: "ok" | "warn" | "critical" | "full";
  };
  /** 未读站内通知数（铃铛角标） */
  unreadNotifications?: number;
  /** 当前空间（切换器用；切空间 = 请求带 x-workspace） */
  workspace?: WorkspaceSummary;
  /** 我加入的全部空间 */
  workspaces?: WorkspaceSummary[];
}

export type WorkspaceRole = "owner" | "admin" | "member";

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: WorkspaceRole;
}

export interface AdminUser {
  id: string;
  name: string;
  role: "admin" | "member";
  quota_bytes: number;
  created_at: number;
  disabled_at: number | null;
  /** Access 身份绑定锚点：首登按 email 锚定存量账号 */
  email: string | null;
}

export interface Share {
  id: string;
  node_id: string;
  token: string;
  expires_at: number | null;
  downloads: number;
  /** 下载次数上限（一次性分享为 1；null 表示不限） */
  max_downloads?: number | null;
  /** 最近一次下载时间（无下载为 null） */
  last_download_at?: number | null;
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
