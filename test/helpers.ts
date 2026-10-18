import { env } from "cloudflare:test";
import { SignJWT, importJWK } from "jose";
import { randomId } from "../server/lib/crypto";
import { childPath, ensureRootDir } from "../server/lib/nodes";
import { TEST_ACCESS_PRIVATE_JWK } from "./fixtures/access-keys";
import type { NodeRow, UserRow } from "../server/types";

export async function seedUser(overrides: Partial<UserRow> = {}): Promise<UserRow> {
  const user: UserRow = {
    id: randomId(),
    access_sub: `sub-${randomId()}`,
    email: null,
    access_bound_at: null,
    name: "tester",
    role: "member",
    quota_bytes: 10_737_418_240,
    created_at: Date.now(),
    disabled_at: null,
    ...overrides,
  };
  await env.DB.prepare(
    "INSERT INTO users (id, access_sub, email, access_bound_at, name, role, quota_bytes, created_at, disabled_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
  )
    .bind(
      user.id,
      user.access_sub,
      user.email,
      user.access_bound_at,
      user.name,
      user.role,
      user.quota_bytes,
      user.created_at,
      user.disabled_at,
    )
    .run();
  return user;
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
    const p = await env.DB.prepare("SELECT id, path FROM nodes WHERE id = ?1")
      .bind(n.parent_id)
      .first<{ id: string; path: string }>();
    if (p) n.path = `${p.path}${p.id}/`;
  } else {
    const root = await ensureRootDir(env.DB, n.owner_id);
    n.parent_id = root.id;
    n.path = childPath(root);
  }
  await env.DB.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
  )
    .bind(
      n.id,
      n.owner_id,
      n.parent_id,
      n.path,
      n.name,
      n.is_dir,
      n.r2_key,
      n.size,
      n.mime,
      n.created_at,
      n.updated_at,
      n.deleted_at,
    )
    .run();
  return n;
}
