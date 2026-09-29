import { env } from "cloudflare:test";
import { sign } from "hono/jwt";
import { pbkdf2Hash, randomId } from "../server/lib/crypto";
import { childPath, ensureRootDir } from "../server/lib/nodes";
import { SESSION_COOKIE } from "../server/middleware/session";
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
    disabled_at: null,
    ...overrides,
  };
  await env.DB.prepare(
    "INSERT INTO users (id, oidc_sub, name, role, webdav_password_hash, quota_bytes, created_at, disabled_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)"
  ).bind(user.id, user.oidc_sub, user.name, user.role, user.webdav_password_hash, user.quota_bytes, user.created_at, user.disabled_at).run();
  return user;
}

export async function davHeaders(user: UserRow, password = "davpass123"): Promise<Record<string, string>> {
  await env.DB.prepare("UPDATE users SET webdav_password_hash = ?1 WHERE id = ?2")
    .bind(await pbkdf2Hash(password), user.id).run();
  return { authorization: `Basic ${btoa(`${user.name}:${password}`)}` };
}

export async function sessionHeaders(user: UserRow): Promise<{ cookie: string }> {
  const token = await sign(
    { sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + 3600 },
    "test-session-secret",
  );
  return { cookie: `${SESSION_COOKIE}=${token}` };
}

export async function seedNode(overrides: Partial<NodeRow> & { owner_id: string }): Promise<NodeRow> {
  const n: NodeRow = {
    id: randomId(),
    parent_id: "",
    path: "/",
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
  // 物化路径：指定父节点时按父行计算；未指定父节点挂根哨兵行（顶层 parent_id = 哨兵行 id）
  if (n.parent_id) {
    const p = await env.DB.prepare("SELECT id, path FROM nodes WHERE id = ?1").bind(n.parent_id).first<{ id: string; path: string }>();
    if (p) n.path = `${p.path}${p.id}/`;
  } else {
    const root = await ensureRootDir(env.DB, n.owner_id);
    n.parent_id = root.id;
    n.path = childPath(root);
  }
  await env.DB.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)"
  ).bind(n.id, n.owner_id, n.parent_id, n.path, n.name, n.is_dir, n.r2_key, n.size, n.mime, n.created_at, n.updated_at, n.deleted_at).run();
  return n;
}
