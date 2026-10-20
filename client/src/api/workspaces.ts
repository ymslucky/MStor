import { api } from "./client";
import type { WorkspaceRole, WorkspaceSummary } from "./types";

export interface MemberSummary {
  user_id: string;
  name: string;
  email: string | null;
  role: WorkspaceRole;
  created_at: number;
}

export interface InvitationSummary {
  email: string;
  role: WorkspaceRole;
  created_at: number;
  expires_at: number;
}

export const listWorkspaces = () =>
  api<{ current: WorkspaceSummary; workspaces: WorkspaceSummary[] }>("/api/workspaces");

export const listMembers = () => api<{ members: MemberSummary[] }>("/api/workspaces/members");

export const listInvitations = () => api<{ invitations: InvitationSummary[] }>("/api/workspaces/invitations");

export const createInvitation = (email: string, role: "member" | "admin" = "member") =>
  api<{ token: string; expiresAt: number; url: string }>("/api/workspaces/invitations", {
    method: "POST",
    json: { email, role },
  });

export const revokeInvitation = (token: string) =>
  api<{ ok: true }>(`/api/workspaces/invitations/${encodeURIComponent(token)}`, { method: "DELETE" });

/** 待绑定成员（有 Access 身份但没有任何空间）：平台管理员排障/补邀请用 */
export const listUnbound = () =>
  api<{ users: { id: string; name: string; email: string | null; created_at: number }[] }>("/api/me/admin/unbound", {
    skipActAs: true,
  });
