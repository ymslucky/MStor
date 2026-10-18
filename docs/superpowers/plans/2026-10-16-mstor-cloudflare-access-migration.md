# MStor 认证切换 Cloudflare Access 方案（纯 Access，单栈）v3

> 目标：废弃「自建 OIDC + 自有 HS256 会话 cookie」，认证**整体替换为 Cloudflare Access（Zero Trust）**——
> Access 负责登录入口与用户身份，Worker 侧保留**强制的 Access JWT 验签**作为纵深防御；不做模式切换、不保留 OIDC。
> 首次部署沿用「首个完成登录者自动成为 admin」（Access 邮箱白名单使其天然免竞态）。
> 实施方式：Batch 1-5 顺序执行，每 Batch 独立 commit + 全绿验收（`npm run check` / `npm run test:ci`）。
>
> **v3.2 实施加固**：`access_bound_at` 标记旧 OIDC sub 是否已被可信 Access 登录确认，避免迁移后 email 碰撞静默顶替账号；静态测试 JWKS 遇 `cf-ray` fail closed；JWT 强制包含 `exp`；真实值占位符由 `predeploy` 脚本拦截。
> **v3.1 修订**（官方文档核查后）：主保护升级为 **Worker 级 Access**（自动覆盖 workers.dev，官方 hierarchy 确认 Bypass 应用优先）；jose 验签显式限定 RS256 + 防御空 `sub`；新增 Binding cookie/HttpOnly 建议；确认登出端点无官方跳转参数。

## 0. 现状盘点（实测）

| 关注点 | 现状 | 位置 |
|---|---|---|
| 登录 | OIDC 授权码 + PKCE + DPoP（RFC 9449），IdP = `https://auth.msxor.com`，`client_secret_basic` | [auth.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/server/routes/auth.ts) |
| 会话 | 自签 HS256 JWT（`SESSION_SECRET`）→ `mstor_session` cookie，7 天；另存 `mstor_idt` 供 RP 登出 | [session.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/server/middleware/session.ts) |
| 身份键 | `users.oidc_sub`（NOT NULL UNIQUE），首登自动建号（首个用户 = admin，其余 member） | [schema.sql](file:///c:/Users/YMS/Documents/Code/cf-storage/sql/schema.sql#L10-L19) |
| 未鉴权路径 | `/api/health`、`/auth/*`、`/api/s/*`（公开分享），注册在中间件之前 | [index.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/server/index.ts#L21-L28) |
| 限流 | `/auth/*` 按 IP 限流（Cloudflare Rate Limiting 绑定，30/60s） | [ratelimit.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/server/middleware/ratelimit.ts) |
| 前端 401 | 首次访问渲染登录落地页；「曾登录」标记下才一次性跳 `/auth/login` | [App.tsx](file:///c:/Users/YMS/Documents/Code/cf-storage/client/src/App.tsx#L23-L53)、[client.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/client/src/api/client.ts#L30-L52) |
| 登出 | 前端确认弹窗 → `POST /auth/logout` 清 cookie → 回首页 | [AppShell.tsx](file:///c:/Users/YMS/Documents/Code/cf-storage/client/src/shell/AppShell.tsx#L193-L212) |
| 静态资源 | `assets` + SPA fallback，`run_worker_first: ["/api/*","/auth/*"]`；**无 `routes` 字段**（自定义域名疑为 Dashboard 配置） | [wrangler.jsonc](file:///c:/Users/YMS/Documents/Code/cf-storage/wrangler.jsonc#L7-L12) |
| 测试 | `test/helpers.ts#sessionHeaders()` 用 `SESSION_SECRET` 签会话 cookie，全仓 ~250 处调用 | [helpers.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/test/helpers.ts#L25-L31) |
| WebDAV | 已移除（0013_drop_webdav）→ 无机器客户端，不需要 Access Service Token | `migrations/0013_drop_webdav.sql` |

关键事实：Access 会向受保护应用注入 `Cf-Access-Jwt-Assertion`，官方推荐用 `jose` + `${TEAM_DOMAIN}/cdn-cgi/access/certs` 验签（`issuer` = team domain，`audience` = 应用 AUD）。

## 1. 核心裁定

| 决策项 | 裁定 | 为什么 |
|---|---|---|
| 架构 | **纯 Access 单栈**：删除 OIDC 路由、自有会话、SESSION_SECRET；每请求验签 Access JWT（无状态） | 单一认证路径，无双攻击面、无模式错配；吊销语义由 Access 统一 |
| 身份来源 | Access JWT 的 `sub`（主键）+ `email`（绑定/展示） | `sub` 稳定不可变；`email` 是可人工核对的绑定媒介，承接存量用户 |
| 存量迁移 | 迁移期 `ACCESS_PROVISION=off`：未知身份 403 + **日志输出 `sub`/`email`**，管理员按日志回填后再开自动建号 | 防止「同一人双账号、旧数据孤儿」；过程确定可回滚 |
| 首登建 admin | 沿用「首个完成登录者 = admin」。Access 的 Allow 策略即邮箱白名单，**外人抢注竞态实际不可能** | 零新代码；部署时在控制台配好白名单即安全 |
| 公开分享 | 独立 Access 应用（`/s`、`/s/*`、`/api/s/*`、`/api/health`）走 **Bypass** | 分享链接必须对未登录访客可用；同域多应用「最具体路径优先」 |
| 上线/回滚开关 | 用 **Worker 级 Access 的启用/关闭**（或其策略 Allow ↔ Bypass）当总开关，不写代码 feature flag | 秒级切换、无需重新部署；出问题一键回退 |
| 本地开发 | `AUTH_MODE=dev` 走 `.dev.vars`（身份取 `x-dev-email`）；带 `cf-ray` 头即拒绝 dev 模式 | 部署态恒 `access`，本地无 Access 可调试 |
| CSRF | 非 GET/HEAD 校验 Origin / Sec-Fetch-Site | Access 凭据是浏览器 cookie + 边缘注入 JWT，需防跨站触发 |
| 登出 | 前端跳 `/cdn-cgi/access/logout`（**跨应用全局登出**，无法按应用单独登出） | Access 官方端点；语义变化写入文档与文案 |

## 2. 目标架构与请求流

```
浏览器 ──▶ Cloudflare Edge ──▶ [Access 应用判定]
                              ├─ Worker 级 Access（Allow=邮箱白名单，覆盖该 Worker 全部入口含 workers.dev）
                              │    未登录 → 302 到 IdP → 登录后回原 URL，注入 Cf-Access-Jwt-Assertion
                              └─ 应用 B（/s、/s/*、/api/s/*、/api/health → Bypass，匿名可达）
                                     └─▶ Worker accessMiddleware
                                          ├─ 无 JWT → 401（fail closed）
                                          ├─ jose 验签（iss=TEAM_DOMAIN, aud=ACCESS_AUD, exp, kid）
                                          ├─ sub/email → 绑定或建号 users 行
                                          └─ 既有逻辑：disabled 检查 → selfId/selfUser → x-act-as → c.get("user")
cron（每日）──▶ Worker scheduled（不经 Access，身份无关）
```

## 3. Zero Trust 侧配置清单（Batch 1，控制台操作）

| 项 | 值 |
|---|---|
| 主保护（推荐） | **Worker 级 Access**：Dashboard → Worker → **Access** 标签 → Protect this Worker（All traffic）+ Allow 策略（邮箱白名单）。自动覆盖该 Worker 全部入口（routes / Custom Domains / **workers.dev** / 预览），域名变化自动跟随；`ACCESS_AUD` 取该 Worker 级应用的 tag |
| 备选 | hostname 型 Self-hosted 应用（`stor.msxor.com` 路径 `*`）——仅当需要 WebSocket 时（Worker 级不支持 WS 升级），此时 workers.dev 需单独防护 |
| 公开分享应用 | Self-hosted，`stor.msxor.com`，路径 `/s`、`/s/*`、`/api/s/*`、`/api/health`，Action = **Bypass**（Include Everyone）。**优先级高于 Worker 级保护**（官方 Access hierarchy：hostname/path 应用 > Worker 级 > 账户级），分享路径匿名可达 |
| Session Duration | 应用级 24h（官方默认基线）；层级 policy > application > global，**global ≥ application 更安全**（每次换发 app token 会重跑策略） |
| Cookie 高级设置 | 应用 Configure → Advanced → Cookie settings：开启 **Binding cookie**（`CF_Binding`，token 绑定浏览器，缓解盗用/重放）；可开 **HttpOnly**（本项目前端无需读 JWT） |
| Identity Provider | 待定，见下 |
| 记录值 | `ACCESS_TEAM_DOMAIN`（`https://<team>.cloudflareaccess.com`）、`ACCESS_AUD`（Worker 级应用的 AUD tag） |
| workers.dev | Worker 级 Access 已自动覆盖（后门天然封堵）；仍建议 `wrangler.jsonc` 加 `"workers_dev": false` 作纵深（减少暴露面与无谓流量） |
| 成本 | Self-hosted Access 免费额度 50 用户内，本项目规模无额外费用 |

**IdP 选择（上线前置风险，Batch 1 实测敲定）**：现网 MSAuth（`auth.msxor.com`）对 token 端点**强制 DPoP**（见 [auth.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/server/routes/auth.ts#L64-L96)），Access 作为 OIDC 客户端不支持 DPoP → 「Access + MSAuth」可能直接联调失败。处置优先级：① MSAuth 侧为 Access 新建客户端并关闭 DPoP 要求；② 换 One-time PIN（邮箱验证码）或 Google/GitHub IdP。**纯 Access 单栈下这是上线阻塞项**，必须先有结论再动代码。

## 4. 代码变更清单

### 4.1 服务端

**新增 `server/middleware/access.ts`**（替代 `session.ts` 的职责，保留其后续语义）：

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

// 模块级缓存 JWKS（Workers 最佳实践：不要在请求内构造）；ACCESS_CERTS_JSON 仅测试注入
let cached: { domain: string; jwks: JWTVerifyGetKey } | null = null;
function jwksFor(env: Env) {
  if (env.ACCESS_CERTS_JSON) return createLocalJWKSet(JSON.parse(env.ACCESS_CERTS_JSON));
  if (!cached || cached.domain !== env.ACCESS_TEAM_DOMAIN) {
    cached = { domain: env.ACCESS_TEAM_DOMAIN,
      jwks: createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)) };
  }
  return cached.jwks;
}

export async function accessMiddleware(c: Context<AppEnv>, next: Next) {
  // dev 模式（仅本地 .dev.vars）：身份取 x-dev-email；带 cf-ray 头说明跑在真实边缘 → 拒绝
  // 生产：取 cf-access-jwt-assertion，缺失 → 401；jwtVerify(iss/aud, algorithms:["RS256"]) 失败 → 401（fail closed）
  // jose 自动校验 exp/nbf/iat；显式限定 RS256 防算法混淆；sub 为空串（service token 误配）→ 拒绝
  const ident = await resolveIdentity(c);
  csrfGuard(c);                       // 非 GET/HEAD：Origin 或 Sec-Fetch-Site 必须同源
  let user = await bindOrProvision(c.env, ident);
  if (user.disabled_at) throw errors.forbidden("账号已被停用");
  c.set("selfId", user.id);
  c.set("selfUser", user);
  // —— 与现 session.ts 逐行一致：admin 切换空间（x-act-as 仅 admin，非 admin 忽略）——
  c.set("user", user);
  await next();
}
```

**新增 `server/lib/users.ts` —— `bindOrProvision`（唯一建号入口）**，查找顺序（均有索引，免全表扫）：

```sql
SELECT * FROM users WHERE email      = ?1 LIMIT 1;  -- ① email 锚点（存量承接）
SELECT * FROM users WHERE access_sub = ?1 LIMIT 1;  -- ② sub 直命中（若 Access IdP sub 延续则零迁移）
```
- ①命中且 `access_bound_at IS NULL`（旧 OIDC 行）→ 一次性回填/确认并写 `access_bound_at`（自愈，`logger.warn("access_bind")`）；已确认后 email/sub 碰撞返回 `409 IDENTITY_CONFLICT`，不允许静默顶替。
- 都未命中：`ACCESS_PROVISION=on` → 建号（`COUNT(*)=0` → admin，其余 member，沿用现有规则）；`off` → `403 ACCOUNT_NOT_PROVISIONED`「账号未开通，请联系管理员」+ `logger.warn("access_unknown_identity", { sub, email })` 供回填。

**修改/删除**

| 文件 | 变更 |
|---|---|
| [env.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/server/env.ts) | 删 `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`/`SESSION_SECRET`；加 `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、`AUTH_MODE`（`"access"｜"dev"`）、`ACCESS_PROVISION`（`"on"｜"off"`）、`ACCESS_CERTS_JSON?`（仅测试） |
| [session.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/server/middleware/session.ts) | 删除（能力并入 `access.ts`）；`SESSION_COOKIE` 常量及引用一并清理 |
| [auth.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/server/routes/auth.ts) | **整体删除**（发现/PKCE/DPoP/callback/RP 登出/`mstor_idt`，约 199 行） |
| [index.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/server/index.ts) | 去掉 `app.route("/auth", auth)` 与 `authRateLimit`；`app.use("/api/*", accessMiddleware)`；`/api/health`、`/api/s` 免鉴权保留 |
| [ratelimit.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/server/middleware/ratelimit.ts) | 无调用方后删除（连同 `wrangler.jsonc` 的 `ratelimits` 绑定）；可选：把限流挪到 `/api/s/*`（公开分享 token 防猜测） |
| [types.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/server/types.ts) | `UserRow`：`oidc_sub → access_sub`，加 `email: string \| null` |
| [me.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/server/routes/me.ts#L33-L37) | 管理页用户列表返回 `email`；PATCH 支持改 `email`（人工绑定入口：格式校验 + 唯一冲突 400） |
| [helpers.ts 依赖] | `ensureRootDir` 建号后仍调用（从 auth.ts 移入 bindOrProvision） |

**新增依赖**：`jose`（官方示例用法，覆盖 kid 选择与 alg/aud/iss/exp 校验，避免手写 WebCrypto 出错）。

### 4.2 前端

| 文件 | 变更 |
|---|---|
| [client.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/client/src/api/client.ts) | 所有请求加 `X-Requested-With: XMLHttpRequest`（Access 过期时 AJAX 才回 401 而非 302 HTML → CORS 报错）；`handleSessionExpired()` 由 `href="/auth/login"` 改为**整页导航** `window.location.assign(location.href)`（触发边缘登录），保留一次性守卫防风暴 |
| [App.tsx](file:///c:/Users/YMS/Documents/Code/cf-storage/client/src/App.tsx#L23-L53) | 删除 `LoginLanding` 与 `/auth/login` 引用（Access 接管登录入口）；401 且非「曾登录」时同样整页导航 |
| [uploads.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/client/src/api/uploads.ts) | XHR 上传补设同款头（大文件分片同样需要） |
| [AppShell.tsx](file:///c:/Users/YMS/Documents/Code/cf-storage/client/src/shell/AppShell.tsx#L193-L212) | 登出确认后：清本地标记 → `window.location.href = "/cdn-cgi/access/logout"`；删除 `POST /auth/logout` 调用；确认弹窗文案注明「将退出所有 Cloudflare Access 应用」。官方登出端点**无 redirect 参数**（社区 `?redirect_url=` 用法不受支持），登出后由 Access 默认登出页承接，用户再访首页即触发登录 |
| [storage.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/client/src/lib/storage.ts#L14-L16) | `SESSION_KEYS.authed` 保留（一次性导航守卫仍需），注释更新语义 |
| PWA（`vite-plugin-pwa`） | 旧 SW 可能缓存登录落地页：验收强刷一次，必要时提升 workbox 缓存版本 |

### 4.3 配置与密钥

```jsonc
// wrangler.jsonc
"workers_dev": false,                                    // 关后门
"routes": [{ "pattern": "stor.msxor.com", "custom_domain": true }],  // 域名纳入 IaC
"assets": { ..., "run_worker_first": ["/api/*"] },        // /auth/* 路由已不存在
"vars": {
  "ACCESS_TEAM_DOMAIN": "https://<team>.cloudflareaccess.com",
  "ACCESS_AUD": "<应用 A 的 AUD tag>",
  "AUTH_MODE": "access",
  "ACCESS_PROVISION": "off",          // 迁移窗口先 off，绑定完成后改 on
  "PUBLIC_URL": "https://stor.msxor.com",
  "R2_ENDPOINT": "...", "DEFAULT_QUOTA_BYTES": "10737418240",
  "SMALL_FILE_LIMIT": "62914560", "TRASH_RETENTION_DAYS": "30"
}
```

- 删密钥：`npx wrangler secret delete SESSION_SECRET`、`npx wrangler secret delete OIDC_CLIENT_SECRET`；删 vars：`OIDC_ISSUER`/`OIDC_CLIENT_ID`。
- 本地 `.dev.vars`（**`.gitignore` 需先补 `.dev.vars*`**）：`AUTH_MODE=dev`、`DEV_AUTH_EMAIL=you@example.com`。

### 4.4 数据迁移（0015）

```sql
-- migrations/0015_access_identity.sql（同步改 sql/schema.sql，schema-parity 测试校验一致性）
ALTER TABLE users RENAME COLUMN oidc_sub TO access_sub;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN access_bound_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
```

- `RENAME COLUMN` 为元数据操作，保留 `NOT NULL UNIQUE` 约束与 `nodes → users(id)` 外键；**先 `--local` 验证再上远程**。
- `access_bound_at IS NULL` 表示该行仍持有旧 IdP sub；首次可信 Access 登录（email 锚点或 sub 延续）会回填/确认并写入时间。此后 email 再碰撞不会静默顶替账号，而是返回 `IDENTITY_CONFLICT`。
- 存量行 `access_sub` 仍是旧 IdP sub：若 Access IdP 与 MSAuth 相同且 sub 延续 → ② 直命中零迁移；否则按 `email` 回填承接（见 bindOrProvision ①）。
- 回填入口（二选一）：管理页编辑 `email`，或直接 SQL `UPDATE users SET email='alice@example.com' WHERE id='…'`。
- **回滚反向迁移**：`ALTER TABLE users RENAME COLUMN access_sub TO oidc_sub; DROP INDEX idx_users_email; ALTER TABLE users DROP COLUMN access_bound_at;`（`email` 列无法删除，残留可接受；若旧 sub 已被 Access 回填写换，优先用迁移前备份恢复）。

## 5. 测试改造

| 项 | 做法 |
|---|---|
| 测试密钥 | 生成专用 RSA 密钥对：私钥 `test/fixtures/access.key.json`（仅测试），公钥 JWKS 作为 `ACCESS_CERTS_JSON` 写入 [vitest.config.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/vitest.config.ts#L16-L24)（移除 `SESSION_SECRET`/`OIDC_CLIENT_SECRET`，加 `ACCESS_AUD`/`ACCESS_TEAM_DOMAIN`/`AUTH_MODE=access`） |
| 请求头 | **保持 `sessionHeaders(user)` 名称与签名不变**，仅改实现：jose `SignJWT` 签 `{ sub, email, iss, aud, exp }`，返回 `{ "cf-access-jwt-assertion": token, origin: "https://example.com" }` → 全仓 ~250 处调用零改动 |
| 重写 [auth.test.ts](file:///c:/Users/YMS/Documents/Code/cf-storage/test/auth.test.ts) | 删除 OIDC/DPoP/fetchMock 用例，替换为：① 无 JWT → 401；② 伪造/错 `aud`/`iss`/`exp` → 401；③ 未知身份 + `ACCESS_PROVISION=off` → 403 且日志含 sub/email；④ email 命中存量 → 复用同一 `id`（数据不丢）并回填 `access_sub`；⑤ 首个新用户 admin、其后 member；⑥ disabled → 403；⑦ 非 GET 跨站 Origin → 403；⑧ `sub` 为空串（service token 误配）→ 401；⑨ dev 模式带 `cf-ray` → 拒绝 |
| 断言更新 | 少数断言 `set-cookie: mstor_session` 的用例（如 `errors.test.ts`）改为断言 401/403 body code |

## 6. 分批实施与验收

### Batch 1 · Zero Trust 预研（不改代码，先拿结论；**IdP 结论是代码动工前置条件**）
1. 备份：`npx wrangler d1 export mstor --remote --output=backup-2026-10-16.sql`
2. 控制台：① 建公开分享 Bypass 应用（`/s`、`/s/*`、`/api/s/*`、`/api/health`，Include Everyone）——立即生效且不影响现网 OIDC；② Worker 级 Access 先**建好不 Apply**（或先不启用），仅记录 team domain 与 AUD；③ `workers_dev: false` 随 Batch 4 部署生效
3. 存量用户确认：`npx wrangler d1 execute mstor --remote --command="SELECT id,name,role,created_at FROM users"`
4. **IdP 联调**：验证 MSAuth DPoP × Access；不行则定 One-time PIN / Google，并确认 Access JWT 的 `sub` 与旧 `oidc_sub` 是否延续（决定回填量）
5. 实测断言：
```bash
curl -sI https://stor.msxor.com/            | head -3   # 期望：302 → IdP（Allow 生效后）
curl -si https://stor.msxor.com/s/<token>   | head -3   # 期望：200（Bypass 生效）
curl -si https://stor.msxor.com/api/health  | head -3   # 期望：200
curl -si https://mstor.<acct>.workers.dev/api/me        # 期望：非 200 数据（确认无后门）
```
6. 产出：team domain / AUD / IdP 结论 / email 回填清单。

### Batch 2 · 服务端切换（TDD）
`jose` 依赖 → 迁移 0015 + schema.sql 同步 → `env.ts`/`types.ts` → 新增 `access.ts` + `lib/users.ts` → 删 `session.ts`/`auth.ts`/`ratelimit.ts` → 调整 `index.ts` → 重写 `test/auth.test.ts`、改造 `test/helpers.ts`。
验收：`npm run check && npm run test`

### Batch 3 · 客户端
`X-Requested-With` → 整页导航重登 → 登出跳 `/cdn-cgi/access/logout` → 删登录落地页 → 更新受影响客户端用例。
验收：`npm run test:client`

### Batch 4 · 配置/文档/CI
`wrangler.jsonc`（workers_dev/routes/vars 删 OIDC 加 Access/删 ratelimits）→ `.gitignore` 补 `.dev.vars*` → README 认证章节重写（Zero Trust 配置步骤、密钥删除清单、登出语义、应急恢复）→ 删除无用密钥。
验收：`npm run test:ci`

### Batch 5 · 上线（维护窗口；部署前需你明确批准）
1. `npx wrangler d1 migrations apply mstor --remote`（0015）
2. `npm run deploy`（`ACCESS_PROVISION=off`）
3. 开启 **Worker 级 Access**（Worker → Access 标签 → Protect this Worker（All traffic），策略 Allow 邮箱白名单，开启 Binding cookie）——此刻起 OIDC 登录失效、workers.dev 后门同步封堵，认证切换完成
4. 逐账号首登 → `wrangler tail` 看 `access_unknown_identity` → 管理页回填 `email` → 全部绑定后 `ACCESS_PROVISION=on` 重新部署
5. 验收清单：
   - 登录/登出/过期重登（Session Duration 临时调 5 分钟验证 401 → 整页登录）
   - 存量数据归属正确（文件/分享/配额/回收站），admin 权限与 `x-act-as` 正常
   - 无痕窗口打开分享链接（含带提取码、文件夹分享、下载计数）
   - 小文件直传 + 大文件分片（含暂停续传）、下载、预览、搜索
   - `curl` 复核 Batch 1 四条断言；cron 每日任务无异常
6. 回滚：关闭 Worker 级 Access（秒级，但 OIDC 代码已删 → 需 `npx wrangler rollback` 回上一版本 + 反向迁移 + 恢复密钥）→ 极端情况用 Batch 1 备份恢复 D1

## 7. 风险与待确认项

| # | 项 | 影响 | 处置 |
|---|---|---|---|
| R1 | MSAuth 强制 DPoP × Access 不兼容 | **上线阻塞**（纯 Access 无备选路径） | Batch 1 实测；不行则 Access 侧换 OTP/Google IdP |
| R2 | workers.dev 绕过 Access 后门 | 认证形同虚设 | **Worker 级 Access 自动覆盖 workers.dev**（官方行为）；`workers_dev: false` 作纵深 |
| R3 | 公开分享路径可能被主保护拦截 | 分享链接要求登录 | 官方 Access hierarchy 确认 hostname/path 应用优先于 Worker 级；Batch 1 curl 实测复核 |
| R4 | Access 会话过期时 AJAX 回 302 HTML | 前端 CORS/解析报错 | 统一加 `X-Requested-With: XMLHttpRequest` 换 401 |
| R5 | 存量身份绑定错人 | 数据归属错乱 | `ACCESS_PROVISION=off` 迁移窗 + 日志输出身份 + D1 备份 |
| R6 | Access 登出为**跨应用全局登出** | 语义变化 | 弹窗文案 + README 说明；退出后需重走 IdP |
| R7 | Access 吊销有 20-30s 传播延迟 | 紧急封禁非瞬时 | `users.disabled_at` 应用级即时封禁双保险；运维：应用 Configure → **Revoke existing tokens** 可立即终止该应用全部会话（被吊销者 1 分钟内重登报错属预期） |
| R8 | AUD/team domain 配错（如应用重建） | 全站 401 | 值进 `vars` 便于审查，改后 `wrangler deploy` 即恢复；worst case 用 wrangler 直接改 vars 部署 |
| R9 | Bypass 路径伪造 `Cf-Access-Jwt-Assertion` | 伪造头穿透 | Worker 侧**强制验签**（伪造必挂）；`/api/s/*` 本就无会话中间件 |
| R10 | 迁移后旧 PWA 缓存 | 仍显示登录落地页 | 验收强刷；必要时提升 workbox 版本 |
| R11 | `.dev.vars` 未被忽略 | 本地身份变量可能入库 | Batch 4 补 `.gitignore` |
| R12 | OIDC 代码删除后回滚需多步 | 回滚窗口变长 | 回滚顺序文档化（Bypass → wrangler rollback → 反向迁移 → 恢复密钥）；迁移完成后保留一版含 OIDC 的历史部署 |
| R13 | Access 故障/配额（Zero Trust 服务异常） | 全站不可登录 | `/api/s/*` 分享不受影响；Access 可用性 SLA 由 Cloudflare 承担；接受此集中化风险 |

## 8. 规模与取舍说明

- 服务端净删约 250 行（auth 路由 + 会话 + 限流），新增约 120 行（access 中间件 + bindOrProvision）。
- 测试改动集中在 3 个文件（`vitest.config.ts`、`helpers.ts`、`auth.test.ts`）+ 少量 cookie 断言；其余 ~250 处 `sessionHeaders` 调用维持原样（仅换实现）。
- 明确不做：OIDC 保留/切换（用户已裁定纯 Access）、Service Token（无机器客户端）、从 Worker 调 Zero Trust API（token 权限过大）、按应用独立登出（Access 不支持）。
