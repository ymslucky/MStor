import { env } from "cloudflare:test";
import { SignJWT, importJWK } from "jose";
import { randomId } from "../server/lib/crypto";
import { childPath, ensureRootDir } from "../server/lib/nodes";
import { TEST_ACCESS_PRIVATE_JWK } from "./fixtures/access-keys";
import type { NodeRow, UserRow } from "../server/types";

export async function seedUser(overrides: Partial<UserRow> & { quota_bytes?: number } = {}): Promise<UserRow> {
  const { quota_bytes: quotaOverride, ...rest } = overrides;
  const user: UserRow = {
    id: randomId(),
    access_sub: `sub-${randomId()}`,
    email: null,
    access_bound_at: null,
    name: "tester",
    platform_admin: 0,
    created_at: Date.now(),
    disabled_at: null,
    ...rest,
  };
  await env.DB.prepare(
    "INSERT INTO users (id, access_sub, email, access_bound_at, name, platform_admin, created_at, disabled_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
  )
    .bind(user.id, user.access_sub, user.email, user.access_bound_at, user.name, user.platform_admin, user.created_at, user.disabled_at)
    .run();
  // 2.0：每个用户配一个个人空间（路由按 workspace 解析，缺空间会 404）
  const wsId = randomId();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO workspaces (id, name, slug, quota_bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(wsId, `ws-${user.name}`, `u-${user.id}`, quotaOverride ?? 10_737_418_240, now),
    env.DB.prepare("INSERT INTO memberships (workspace_id, user_id, role, created_at) VALUES (?1, ?2, 'owner', ?3)")
      .bind(wsId, user.id, now),
    env.DB.prepare("INSERT INTO storage_stats (workspace_id, updated_at) VALUES (?1, ?2)").bind(wsId, now),
  ]);
  await ensureRootDir(env.DB, wsId);
  return user;
}

/** 用户 → 个人空间 id（用例既按 user 断言，也按 workspace 插数据） */
export async function workspaceOf(userId: string): Promise<string> {
  const row = await env.DB.prepare(
    "SELECT workspace_id FROM memberships WHERE user_id = ?1 ORDER BY created_at LIMIT 1",
  ).bind(userId).first<{ workspace_id: string }>();
  if (!row) throw new Error(`user ${userId} has no workspace`);
  return row.workspace_id;
}
/** 签发测试用 Access JWT（与线上 Cf-Access-Jwt-Assertion 同构：RS256 / iss / aud / sub / email）。
 *  iss/aud 与 vitest.config 注入的 ACCESS_TEAM_DOMAIN / ACCESS_AUD 配对；exp 为 epoch 秒（缺省 1h 后）。 */
export async function signAccessJwt(claims: {
  sub: string;
  email?: string | null;
  iss?: string;
  aud?: string;
  exp?: number | null;
}): Promise<string> {
  const key = await importJWK(TEST_ACCESS_PRIVATE_JWK, "RS256");
  const builder = new SignJWT(claims.email ? { email: claims.email } : {})
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(claims.iss ?? "https://test-team.cloudflareaccess.com")
    .setAudience(claims.aud ?? "test-aud");
  if (claims.exp === null) {
    // 显式构造缺失 exp 的负例 token
  } else if (claims.exp !== undefined) builder.setExpirationTime(claims.exp);
  else builder.setIssuedAt().setExpirationTime("1h");
  return builder.sign(key);
}

/** 鉴权头：全仓用例沿用此入口（原会话 cookie 已由 Access JWT 取代，名称不变避免 ~250 处调用改动） */
export async function sessionHeaders(user: UserRow): Promise<{ "cf-access-jwt-assertion": string }> {
  return { "cf-access-jwt-assertion": await signAccessJwt({ sub: user.access_sub, email: user.email }) };
}

export async function seedNode(overrides: Partial<NodeRow> & { owner_id: string }): Promise<NodeRow> {
  // 迁移兼容：用例仍按「用户」声明归属，这里翻译成 workspace（隔离维度）
  const { owner_id, ...rest } = overrides;
  const workspaceId = rest.workspace_id ?? (await workspaceOf(owner_id));
  const n: NodeRow = {
    id: randomId(),
    workspace_id: workspaceId,
    created_by: owner_id,
    parent_id: "",
    path: "/",
    name: `n-${randomId()}`,
    is_dir: 0,
    r2_key: null,
    size: null,
    mime: null,
    sha256: null,
    content_version: 1,
    thumb_key: null,
    width: null,
    height: null,
    taken_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    deleted_at: null,
    ...rest,
  };
  // 物化路径：指定父节点时按父行计算；未指定父节点挂根哨兵行
  if (n.parent_id) {
    const p = await env.DB.prepare("SELECT id, path FROM nodes WHERE id = ?1")
      .bind(n.parent_id)
      .first<{ id: string; path: string }>();
    if (p) n.path = `${p.path}${p.id}/`;
  } else {
    const root = await ensureRootDir(env.DB, n.workspace_id);
    n.parent_id = root.id;
    n.path = childPath(root);
  }
  await env.DB.prepare(
    "INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
  )
    .bind(n.id, n.workspace_id, n.created_by, n.parent_id, n.path, n.name, n.is_dir, n.r2_key, n.size, n.mime, n.created_at, n.updated_at, n.deleted_at)
    .run();
  return n;
}
