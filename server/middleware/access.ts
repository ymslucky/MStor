import type { Context, Next } from "hono";
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AppEnv } from "../env";
import { HttpError, errors } from "../lib/errors";
import { ensurePersonalWorkspace, resolveWorkspace } from "../data/workspaces";
import { ensureRootDir } from "../lib/nodes";
import { refreshAuditEnabled } from "../lib/audit";
import { getSetting } from "../lib/settings";
import { bindOrProvision, type AccessIdentity } from "../lib/users";
import type { UserRow } from "../types";

// 模块级 JWKS 缓存：isolate 内复用同一实例（内部缓存 keys，未知 kid 才回源 /cdn-cgi/access/certs）
let cached: { domain: string; jwks: JWTVerifyGetKey } | null = null;

function jwksFor(env: AppEnv["Bindings"]): JWTVerifyGetKey {
  // 测试注入静态 JWKS（生产留空，走 team domain 的 /cdn-cgi/access/certs）
  if (env.ACCESS_CERTS_JSON) return createLocalJWKSet(JSON.parse(env.ACCESS_CERTS_JSON));
  if (!cached || cached.domain !== env.ACCESS_TEAM_DOMAIN) {
    cached = {
      domain: env.ACCESS_TEAM_DOMAIN,
      jwks: createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)),
    };
  }
  return cached.jwks;
}

/** 解析可信身份：生产 = jose 验签 Access JWT；dev = 本地固定邮箱（仅 .dev.vars） */
async function resolveIdentity(c: Context<AppEnv>): Promise<AccessIdentity> {
  if (c.env.AUTH_MODE === "dev") {
    // 本地开发：无 Access 环境，身份取请求头或 .dev.vars。
    // cf-ray 头存在说明请求经过真实 Cloudflare 边缘——dev 模式绝不允许在生产运行
    if (c.req.header("cf-ray")) throw errors.forbidden("dev 认证模式不能在真实边缘运行");
    const email = (c.req.header("x-dev-email") ?? c.env.DEV_AUTH_EMAIL ?? "").trim().toLowerCase();
    if (!email) throw errors.unauthorized();
    return { sub: `dev:${email}`, email };
  }
  // 测试 JWKS 与其私钥公开在仓库中；真实边缘（cf-ray 由 Cloudflare 注入）绝不能信任该覆盖配置
  if (c.env.ACCESS_CERTS_JSON && c.req.header("cf-ray")) {
    throw errors.forbidden("测试 JWKS 不能在真实边缘运行");
  }
  const token = c.req.header("cf-access-jwt-assertion");
  if (!token) throw errors.unauthorized();
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, jwksFor(c.env), {
      issuer: c.env.ACCESS_TEAM_DOMAIN,
      audience: c.env.ACCESS_AUD,
      algorithms: ["RS256"], // 显式限定防算法混淆；requiredClaims 强制 exp 存在，存在时 jose 自动校验时效
      requiredClaims: ["exp"],
    }));
  } catch {
    throw errors.unauthorized();
  }
  // service token 认证时 sub 为空串（common_name 才是 client id）——本项目不接受服务身份
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw errors.unauthorized();
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  return { sub, email };
}

/** CSRF 兜底：非 GET/HEAD 请求，Origin / Sec-Fetch-Site 存在时必须同源（缺失放行——非浏览器客户端无此头） */
function csrfGuard(c: Context<AppEnv>) {
  if (c.req.method === "GET" || c.req.method === "HEAD") return;
  const site = c.req.header("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw errors.forbidden("跨站请求被拒绝");
  const origin = c.req.header("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      // 比较协议 + host + port；不能只看 Host，否则跨协议 Origin 会被误判为同源
      sameOrigin = new URL(origin).origin === new URL(c.req.url).origin;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) throw errors.forbidden("跨站请求被拒绝");
  }
}

/**
 * Access 认证中间件（替代原会话 cookie 中间件，无状态）：
 * 验签 JWT → 绑定/建号 → disabled 检查 → selfId/selfUser → x-act-as（仅 admin）→ c.get("user")。
 */
export async function accessMiddleware(c: Context<AppEnv>, next: Next) {
  const ident = await resolveIdentity(c);
  csrfGuard(c);
  // 只读一次设置（30s isolate 缓存）；关闭后 auditStmt 直接 no-op
  await refreshAuditEnabled(c.env.DB);
  let user = await bindOrProvision(c.env, ident, {
    canProvision: async () => (await getSetting(c.env, "registration_enabled")) !== "0",
    approvalRequired: async () => (await getSetting(c.env, "registration_requires_approval")) !== "0",
  });
  if (user.disabled_at) throw errors.forbidden("账号已被停用");
  // 记录会话原始用户：act-as 切换后 c.get("user") 是目标用户，self 类校验应以原始用户为准
  c.set("selfId", user.id);
  // 原始用户行（act-as 替换前）：供 /api/me 返回登录账号展示
  c.set("selfUser", user);
  // admin 切换空间：x-act-as 指向目标用户；非 admin 忽略该头（物理隔离不被绕过）
  const actAs = c.req.header("x-act-as");
  if (actAs && user.platform_admin === 1) {
    const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(actAs).first<UserRow>();
    if (!target) throw errors.notFound();
    if (target.disabled_at) throw errors.forbidden("目标用户已停用");
    user = target;
    // 不在每个请求上写审计：x-act-as 是读取上下文，不是一次「进入空间」动作。
    // 进入动作由 POST /api/me/admin/act-as 显式记录一次（见 routes/me.ts）。
  }
  c.set("user", user);
  // 待审核用户：只允许读取 /api/me 查看待审状态；其余 API 一律拒绝，避免提前建空间
  if (user.approved_at === null) {
    if (c.req.path === "/api/me" && c.req.method === "GET") {
      await next();
      return;
    }
    throw new HttpError(403, "ACCOUNT_PENDING", "账号待管理员审核");
  }
  // 租户解析：未指定 x-workspace 时用默认空间；首登无空间则就地建个人空间（幂等）
  const requested = c.req.header("x-workspace") ?? null;
  let resolved;
  try {
    resolved = await resolveWorkspace(c.env.DB, user.id, requested);
  } catch (e) {
    if (requested || !(e instanceof HttpError) || e.status !== 404) throw e;
    // 个人云盘：首登直接建私有空间；不再认领邀请/共享空间
    const rawQuota = Number(await getSetting(c.env, "default_quota_bytes"));
    const quotaBytes = Number.isFinite(rawQuota) && rawQuota > 0 ? rawQuota : 1_073_741_824;
    const created = await ensurePersonalWorkspace(c.env.DB, user.id, { quotaBytes });
    await ensureRootDir(c.env.DB, created.id);
    resolved = { workspace: created, role: "owner" as const };
  }
  c.set("workspace", resolved.workspace);
  c.set("role", resolved.role);
  await next();
}
