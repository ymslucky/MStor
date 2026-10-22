import type { patchAdminUser } from "../../api/me";

export const GB = 1024 ** 3;
export const quotaGb = (bytes: number) => Math.round(bytes / GB);
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PatchBody = Parameters<typeof patchAdminUser>[1];
export type StatusFilter = "all" | "active" | "disabled";
