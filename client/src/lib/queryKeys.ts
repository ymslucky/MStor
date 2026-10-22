/**
 * TanStack Query 键工厂：唯一出处，避免字符串字面量漂移（历史上出现过 ["members"] vs ["workspace-members"]）。
 * 既保证缓存共享（收藏/最近在文件页与库页共用同一份数据），也让失效逻辑可搜索。
 */
export const queryKeys = {
  me: ["me"] as const,
  files: (parentId: string) => ["files", parentId] as const,
  filesAll: ["files"] as const,
  shares: ["shares"] as const,
  favorites: ["favorites"] as const,
  recent: ["library-recent"] as const,
  /** 标签库（tagId=null 表示标签列表本身） */
  library: (kind: "tags", tagId: string | null) => ["library", kind, tagId] as const,
  /** 某节点已打的标签 */
  nodeTags: (nodeId: string) => ["node-tags", nodeId] as const,
  members: ["members"] as const,
  invitations: ["invitations"] as const,
  trash: ["trash"] as const,
  notifications: ["notifications"] as const,
  adminUsers: ["admin-users"] as const,
  adminOverview: ["admin-overview"] as const,
  adminSettings: ["admin-settings"] as const,
  search: (q: string, sort: string, kind: string) => ["search", q, sort, kind] as const,
  share: (token: string, password: string) => ["share", token, password] as const,
  shareChildren: (token: string, dirId: string, password: string) => ["share-children", token, dirId, password] as const,
};
