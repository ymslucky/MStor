import { env } from "cloudflare:test";
import { randomId } from "../server/lib/crypto";
import type { NodeRow, UserRow } from "../server/types";

export async function seedUser(overrides: Partial<UserRow> = {}): Promise<UserRow> {
  const user: UserRow = {
    id: randomId(),
    oidc_sub: `sub-${randomId()}`,
    name: "tester",
    role: "member",
    webdav_password_hash: null,
    quota_bytes: 10_737_418_240,
    created_at: Date.now(),
    ...overrides,
  };
  await env.DB.prepare(
    "INSERT INTO users (id, oidc_sub, name, role, webdav_password_hash, quota_bytes, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)"
  ).bind(user.id, user.oidc_sub, user.name, user.role, user.webdav_password_hash, user.quota_bytes, user.created_at).run();
  return user;
}

export async function seedNode(overrides: Partial<NodeRow> & { owner_id: string }): Promise<NodeRow> {
  const n: NodeRow = {
    id: randomId(),
    parent_id: "",
    name: `n-${randomId()}`,
    is_dir: 0,
    r2_key: null,
    size: null,
    mime: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    deleted_at: null,
    ...overrides,
  };
  await env.DB.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)"
  ).bind(n.id, n.owner_id, n.parent_id, n.name, n.is_dir, n.r2_key, n.size, n.mime, n.created_at, n.updated_at, n.deleted_at).run();
  return n;
}
