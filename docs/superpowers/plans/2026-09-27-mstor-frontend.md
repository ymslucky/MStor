# MStor 前端实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MStor（R2 家庭云盘）构建 React 前端：文件浏览/上传/下载/预览、搜索、分享、回收站、设置与管理面板、公开分享页、PWA，部署为 Workers Assets。

**Architecture:** 单体 Worker 已就绪（后端 17 任务全绿）。前端为 `client/` 下的 Vite + React SPA，构建产物输出到 `client/dist`（wrangler.jsonc 的 assets 已指向该目录，`run_worker_first` 已覆盖 `/api/*`、`/auth/*`、`/dav/*`）。开发期 Vite dev server（5173）代理 API 到 wrangler dev（8787）。服务端状态统一走 TanStack Query。计划前 4 个任务为**后端补遗**（spec §6/§7 要求但后端尚未覆盖的 4 个缺口），之后是前端任务。

**Tech Stack:** React 19 + Vite + TailwindCSS v4 + TanStack Query + react-router v7 + vite-plugin-pwa；测试 Vitest + Testing Library（jsdom）。

---

## 执行须知（每个任务开始前必读）

- **环境**：Windows PowerShell。多条命令用 `;` 分隔；不要用 `&&`、heredoc。
- **运行服务端测试**（Task 1-4）前先设：`$env:WRANGLER_LOG_PATH="c:\Users\YMS\Documents\Code\cf-storage\.wrangler\logs"`。miniflare EBUSY / workerd "Can't read from request stream" 为无害噪音。
- **验收标准**：
  - Task 1-4（后端）：`npm test` 全绿 + `npx tsc --noEmit` 零错误（此阶段 `npm test` 仍= `vitest run`）。
  - Task 5-17（前端）：`npm run test:client` 全绿 + `npm run test:server` 全绿 + `npm run check` 零错误；涉及构建的任务额外 `npm run build` 成功。
- **代码规范**：`server/` 禁 `any`（测试文件可 `as`）；`client/` 同样 strict。不加计划外功能。
- **每任务一个 commit**（可拆多个），消息用 `feat:`/`fix:`/`test:` 前缀，与后端阶段风格一致。
- **工作分支**：`feat/backend`（延续，不新建 worktree）。

---

## 后端 API 契约速查（前端任务的事实来源）

统一错误 envelope：`{ "error": { "code": "...", "message": "..." } }`，非 2xx 时返回。已知 code：`UNAUTHORIZED(401)`、`FORBIDDEN(403)`、`QUOTA_EXCEEDED(403)`、`NOT_FOUND(404)`、`CONFLICT(409)`、`BAD_REQUEST(400)`、`SHARE_EXPIRED(410)`、`SHARE_PASSWORD(401)`。

| 端点 | 方法 | 请求 | 响应 |
|---|---|---|---|
| `/api/health` | GET | - | `{ok:true}` |
| `/auth/login` | GET | - | 302 → IdP（浏览器跳转） |
| `/auth/callback` | GET | `?code&state` | 302 → `/` + session cookie |
| `/auth/logout` | GET | - | 302 → `/` + 清 cookie |
| `/api/me` | GET | - | `{id,name,role,quotaBytes,usedBytes}` |
| `/api/me/webdav-password` | PUT | `{password}`（≥8位） | `{ok:true}` |
| `/api/me/admin/users` | GET | admin | `{users: AdminUser[]}` |
| `/api/me/admin/users/:id` | PATCH | admin `{quota_bytes?, role?, disabled?}` | `{ok:true}` |
| `/api/files` | GET | `?parentId=`（默认 ""=根） | `{nodes: Node[], breadcrumb: Node[], rootId}` |
| `/api/files/upload` | PUT | `?name=&parentId=`，body=文件（≤60MB） | 201 `{id,name,size}` |
| `/api/files/:id` | PATCH | `{name?, parentId?}` | `{ok:true}` |
| `/api/files/:id/content` | GET | `?dl=1` 下载；支持 Range | 文件流（inline/attachment） |
| `/api/files/:id` | DELETE | - | `{ok:true}`（软删除） |
| `/api/dirs` | POST | `{parentId?, name}` | 201 `Node` |
| `/api/uploads` | POST | `{parentId?, name, size, mime?}`（>60MB） | 201 `{uploadId, partSize}`（16MB） |
| `/api/uploads/:id/part-urls` | POST | `{partNumbers: number[]}` | `{urls: string[]}`（presigned PUT） |
| `/api/uploads/:id/complete` | POST | `{parts: {partNumber,etag}[], mime?}` | 201 `{nodeId, name}` |
| `/api/uploads/:id` | DELETE | - | `{ok:true}`（中止） |
| `/api/trash` | GET | - | `{nodes: Node[]}`（含 deleted_at） |
| `/api/trash/:id/restore` | POST | - | `{ok:true}` |
| `/api/trash/:id` | DELETE | - | `{ok:true}`（彻底删除） |
| `/api/search` | GET | `?q=` | `{nodes: Node[], paths}` |
| `/api/shares` | POST | `{nodeId, expiresInDays?, password?}` | 201 `{token, url}` |
| `/api/shares` | GET | - | `{shares: Share[]}` |
| `/api/shares/:id` | DELETE | - | `{ok:true}`（撤销） |
| `/api/s/:token` | GET | header `x-share-password`（有码时） | `ShareInfo`（文件夹含 children） |
| `/api/s/:token/children/:dirId` | GET | 同上（Task 4 新增） | `{name, children: PublicNode[]}` |
| `/api/s/:token/raw/:fileId` | GET | 同上 | 文件流 |

**行形状**（D1 原样返回，snake_case）：

```ts
Node = { id, owner_id, parent_id, name, is_dir: 0|1, r2_key, size: number|null, mime: string|null, created_at: number, updated_at: number, deleted_at: number|null }
// 前端类型只取用到字段，但保持 snake_case 以免映射层
AdminUser = { id, name, role: "admin"|"member", quota_bytes, created_at, disabled_at: number|null }   // Task 1 起
Share = { id, node_id, token, expires_at: number|null, downloads, created_at, node_name, node_is_dir: 0|1, node_size: number|null }
ShareInfo = { id, name, isDir: boolean, size: number|null, mime: string|null, hasPassword: boolean, expiresAt: number|null, children?: PublicNode[] }
PublicNode = { id, name, isDir: boolean, size: number|null, mime: string|null }
```

**关键行为**：顶级节点 `parent_id === ""`（根是 `parent_id='' AND name=''` 的哨兵行，`/api/files` 的 nodes 已过滤它）；面包屑含自身所在各级目录（不含根哨兵）；同目录同名由后端处理（新建不会撞名，除并发 409）；`etag` 响应头已列入 CORS ExposeHeaders（分片直传取 ETag 用）。

---

## 文件结构（前端全貌）

```
vite.config.ts                 # root=client，build.outDir=../client/dist，dev 代理 /api /auth /dav → 8787
vitest.client.config.ts        # jsdom + @vitejs/plugin-react，include client/src/**/*.test.*
client/
  index.html
  tsconfig.json                # DOM lib、react-jsx、strict（与根 tsconfig 隔离，根只含 server/test）
  vite-env.d.ts
  public/icon.svg              # PWA 图标
  src/
    main.tsx                   # QueryClientProvider + RouterProvider + PWA 注册
    App.tsx                    # RequireAuth + 路由表
    shell/AppShell.tsx         # 头部（搜索、导航、配额、用户、act-as 横幅）、Toaster
    pages/Browser.tsx          # 主文件浏览页
    pages/TrashPage.tsx
    pages/SharesPage.tsx
    pages/SettingsPage.tsx     # WebDAV 密码 + admin 用户管理
    pages/SharePage.tsx        # 公开分享页 /s/:token（无登录）
    components/FileList.tsx    # 列表（响应式，文件/文件夹行 + 行操作）
    components/Breadcrumb.tsx
    components/NameDialog.tsx  # 新建文件夹/重命名共用
    components/MoveDialog.tsx
    components/ShareDialog.tsx
    components/PreviewModal.tsx
    components/UploadPanel.tsx
    components/Toaster.tsx
    hooks/useFiles.ts          # 列表 query + 各 mutation（失效策略集中于此）
    hooks/useUploadQueue.ts
    hooks/useDebounce.ts
    api/client.ts              # api() 封装 + ApiError + 401 跳登录 + x-act-as
    api/types.ts
    api/nodes.ts               # files/dirs/搜索跳转用的目录树
    api/uploads.ts             # 小文件直传 + 分片直传
    api/trash.ts
    api/search.ts
    api/shares.ts              # 我的分享 + 公开分享
    api/me.ts
    lib/format.ts              # formatBytes/formatDate
    lib/preview.ts             # mime → 预览类型
    index.css                  # @import "tailwindcss"
    test/setup.ts              # jest-dom + cleanup
    test/utils.tsx             # renderWithProviders
```

---
---

### Task 1: 后端补遗——用户停用（migration 0002 + 登录/会话拒绝 + admin PATCH）

spec §6「admin 管理配额/停用」中的停用尚未实现。停用 = `users.disabled_at` 打时间戳；会话请求 403、OIDC 回调 403。

**Files:**
- Create: `migrations/0002_disable_users.sql`
- Modify: `server/types.ts`（UserRow 加 disabled_at）
- Modify: `server/middleware/session.ts`（拒绝停用用户）
- Modify: `server/routes/auth.ts`（callback 拒绝停用用户）
- Modify: `server/routes/me.ts`（PATCH 支持 disabled）
- Modify: `test/helpers.ts`（seedUser 加字段）
- Test: `test/me.test.ts`、`test/auth.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `test/me.test.ts` 末尾追加（该文件已有 `seedUser/sessionHeaders/SELF` 导入，若无则按文件头部现状补）：

```ts
test("admin can disable and enable users", async () => {
  const admin = await seedUser({ role: "admin" });
  const member = await seedUser();
  const disable = await SELF.fetch(`https://example.com/api/me/admin/users/${member.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ disabled: true }),
  });
  expect(disable.status).toBe(200);
  const blocked = await SELF.fetch("https://example.com/api/me", { headers: await sessionHeaders(member) });
  expect(blocked.status).toBe(403);
  expect((await blocked.json()).error.code).toBe("FORBIDDEN");
  const enable = await SELF.fetch(`https://example.com/api/me/admin/users/${member.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ disabled: false }),
  });
  expect(enable.status).toBe(200);
  const ok = await SELF.fetch("https://example.com/api/me", { headers: await sessionHeaders(member) });
  expect(ok.status).toBe(200);
});

test("disabled flag persists in admin list", async () => {
  const admin = await seedUser({ role: "admin" });
  const member = await seedUser();
  await SELF.fetch(`https://example.com/api/me/admin/users/${member.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ disabled: true }),
  });
  const res = await SELF.fetch("https://example.com/api/me/admin/users", { headers: await sessionHeaders(admin) });
  const data = await res.json<{ users: { id: string; disabled_at: number | null }[] }>();
  expect(data.users.find((u) => u.id === member.id)!.disabled_at).not.toBeNull();
});
```

在 `test/auth.test.ts` 末尾追加（沿用文件内 `mockDiscovery/mockToken/idToken/seedUser`）：

```ts
test("disabled user cannot log in via callback", async () => {
  const user = await seedUser({ oidc_sub: "disabled-sub" });
  await env.DB.prepare("UPDATE users SET disabled_at = ?1 WHERE id = ?2").bind(Date.now(), user.id).run();
  mockDiscovery();
  mockToken(idToken({ sub: "disabled-sub", name: "Dave" }));
  const res = await SELF.fetch("https://example.com/auth/callback?code=c&state=x", {
    redirect: "manual",
    headers: { cookie: `mstor_oidc=${encodeURIComponent(JSON.stringify({ state: "x", verifier: "v" }))}` },
  });
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
$env:WRANGLER_LOG_PATH="c:\Users\YMS\Documents\Code\cf-storage\.wrangler\logs"; npx vitest run test/me.test.ts test/auth.test.ts
```

预期：me.test.ts 两个新测试失败（disabled 字段被忽略/请求 200 而非 403）；auth 新测试失败（302 而非 403）。既有 91 测试不受影响。

- [ ] **Step 3: 实现**

`migrations/0002_disable_users.sql`：

```sql
ALTER TABLE users ADD COLUMN disabled_at INTEGER;
```

`server/types.ts` 的 `UserRow` 加一行（放 `role` 之后）：

```ts
  disabled_at: number | null;
```

`server/middleware/session.ts`：`user` 取到后（`c.set("user", user)` 之前）加：

```ts
  if (user.disabled_at) throw errors.forbidden("账号已被停用");
```

`server/routes/auth.ts`：callback 里 upsert 收敛后（`await ensureRootDir(db, user.id);` 之前）加：

```ts
  if (user.disabled_at) throw errors.forbidden("账号已被停用");
```

并把两处 `SELECT * FROM users WHERE oidc_sub = ?1` 的 `.first<{ id: string; role: string }>()` 泛型改为 `.first<{ id: string; role: string; disabled_at: number | null }>()`（UNIQUE catch 分支同改）。

`server/routes/me.ts` 的 `me.patch("/admin/users/:id")`：请求体类型加 `disabled?: boolean`，校验与 set 子句：

```ts
  const { quota_bytes, role, disabled } = await c.req.json<{ quota_bytes?: number; role?: "admin" | "member"; disabled?: boolean }>();
  if (role && !["admin", "member"].includes(role)) throw errors.badRequest("角色不合法");
  if (quota_bytes !== undefined && (!Number.isFinite(quota_bytes) || quota_bytes < 0)) throw errors.badRequest("配额不合法");
  if (disabled !== undefined && typeof disabled !== "boolean") throw errors.badRequest("disabled 不合法");
```

sets/vals 组装处追加：

```ts
  if (disabled !== undefined) { sets.push("disabled_at = ?"); vals.push(disabled ? Date.now() : null); }
```

另外 `me.get("/admin/users")` 的 SELECT 列表补 `disabled_at`（返回 AdminUser 形状需要它）：

```ts
    "SELECT id, name, role, quota_bytes, disabled_at, created_at FROM users ORDER BY created_at"
```

`test/helpers.ts` 的 seedUser 对象字面量加 `disabled_at: null,`（INSERT 语句同步加列 `disabled_at` 与占位符）。

- [ ] **Step 4: 全量验证**

```powershell
$env:WRANGLER_LOG_PATH="c:\Users\YMS\Documents\Code\cf-storage\.wrangler\logs"; npm test; npx tsc --noEmit
```

预期：全部绿（91 + 3 新 = 94）。注意：现有 INSERT users 的语句都是显式列名，新增可空列不影响。

- [ ] **Step 5: 提交**

```powershell
git add migrations/0002_disable_users.sql server test; git commit -m "feat: user disable (migration 0002, session/login rejection, admin patch)"
```

> **审查记录（2026-09-27）**
>
> - 实现：6503408 + ad038a3（规格修复）+ e6530cb（质量修复），最终 96/96 测试绿 + tsc 零错误。
> - 规格审查（FAIL→已修）：①PATCH 缺 `disabled` 布尔类型校验（字符串 "false" 会误停用）→ 补校验；②计划中「disabled flag persists in admin list」测试缺失 → 补齐。偏差确认可接受：拒绝文案由 `errors.forbidden()` 支持自定义参数解决；测试拆分语义等价或更强。
> - 质量审查（NEEDS_FIX→已修）：严重项——davauth.ts 不查 `disabled_at`，停用用户仍可 WebDAV Basic 认证读写 → 验密前短路拒绝（401），补 PROPFIND 401 回归测试；采纳建议——`errors.forbidden(m)` 支持自定义文案，两处拒绝改为「账号已被停用」。其余建议（admin 自锁守护）留待后续任务，本任务不强加。

---

### Task 2: 后端补遗——admin 切换空间（x-act-as）

spec §6「admin 可切换任意用户空间」。实现：session 中间件识别 `x-act-as: <userId>` 请求头，仅当会话用户是 admin 时把 `c.get("user")` 换成目标用户。所有 `/api/*` 路由自动生效，无需改动业务路由。前端 Task 15 的「进入空间」依赖此头。

**Files:**
- Modify: `server/middleware/session.ts`
- Test: `test/me.test.ts`

- [ ] **Step 1: 写失败的测试**

`test/me.test.ts` 末尾追加：

```ts
test("admin can act as another user; member cannot", async () => {
  const admin = await seedUser({ role: "admin" });
  const member = await seedUser();
  // member 名下放一个文件，admin 名下不放
  await seedNode({ owner_id: member.id, name: "members-file.txt" });
  const asMember = await SELF.fetch("https://example.com/api/files", {
    headers: { ...(await sessionHeaders(admin)), "x-act-as": member.id },
  });
  expect(asMember.status).toBe(200);
  const listed = await asMember.json<{ nodes: { name: string }[] }>();
  expect(listed.nodes.map((n) => n.name)).toContain("members-file.txt");
  // member 携带 x-act-as 指向 admin：头被忽略，看到的仍是自己空间（空列表 + admin 文件不在）
  await seedNode({ owner_id: admin.id, name: "admins-file.txt" });
  const memberView = await SELF.fetch("https://example.com/api/files", {
    headers: { ...(await sessionHeaders(member)), "x-act-as": admin.id },
  });
  const memberListed = await memberView.json<{ nodes: { name: string }[] }>();
  expect(memberListed.nodes.map((n) => n.name)).not.toContain("admins-file.txt");
  // 目标不存在 → 404
  const missing = await SELF.fetch("https://example.com/api/files", {
    headers: { ...(await sessionHeaders(admin)), "x-act-as": "no-such-user" },
  });
  expect(missing.status).toBe(404);
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
$env:WRANGLER_LOG_PATH="c:\Users\YMS\Documents\Code\cf-storage\.wrangler\logs"; npx vitest run test/me.test.ts
```

预期：新测试失败（admin 视角看不到 member 文件）。

- [ ] **Step 3: 实现**

`server/middleware/session.ts` 改为：

```ts
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import type { Context, Next } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import type { UserRow } from "../types";

export const SESSION_COOKIE = "mstor_session";

export async function sessionMiddleware(c: Context<AppEnv>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw errors.unauthorized();
  let sub: string;
  try {
    const payload = await verify(token, c.env.SESSION_SECRET, "HS256");
    if (typeof payload.sub !== "string") throw errors.unauthorized();
    sub = payload.sub;
  } catch {
    throw errors.unauthorized();
  }
  let user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(sub).first<UserRow>();
  if (!user) throw errors.unauthorized();
  if (user.disabled_at) throw errors.forbidden("账号已被停用");
  // admin 切换空间：x-act-as 指向目标用户；非 admin 忽略该头（物理隔离不被绕过）
  const actAs = c.req.header("x-act-as");
  if (actAs && user.role === "admin") {
    const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(actAs).first<UserRow>();
    if (!target) throw errors.notFound();
    if (target.disabled_at) throw errors.forbidden("目标用户已停用");
    user = target;
  }
  c.set("user", user);
  await next();
}
```

- [ ] **Step 4: 全量验证**

```powershell
$env:WRANGLER_LOG_PATH="c:\Users\YMS\Documents\Code\cf-storage\.wrangler\logs"; npm test; npx tsc --noEmit
```

预期：全绿（95）。

- [ ] **Step 5: 提交**

```powershell
git add server test; git commit -m "feat: admin act-as via x-act-as header"
```

> **审查记录（2026-09-27）**
>
> - 实现：daca66d，97/97 测试绿 + tsc 零错误。
> - 规格审查 PASS：diff 与计划逐字一致；测试数多于计划预期系 Task 1 审查修复新增，非缺陷。
> - 质量审查 APPROVE：无严重/建议项。关键行为确认——act-as 后 requireAdmin 对被切换的 admin 拒绝 admin 路由（权限降向，符合预期）；`/dav` 走 davAuth 不读 `x-act-as`，无泄漏；不存在→404、停用→403 仅 admin 可见，无额外信息泄漏。吹毛求疵两条（忽略断言未同时断言空列表、两次查询可合并）均按计划保持现状。

---

### Task 3: 后端补遗——搜索结果带面包屑路径

spec §7.5「结果带面包屑路径」。`/api/search` 返回体增加 `paths: Record<nodeId, "顶层目录/子目录/文件名">`（含文件自身名，不含根哨兵）。一次递归 CTE 批量计算（结果上限 50，单批 ≤90 个 IN 参数，符合 D1 ≤100 绑定上限）。

**Files:**
- Modify: `server/routes/search.ts`
- Test: `test/search.test.ts`

- [ ] **Step 1: 写失败的测试**

`test/search.test.ts` 末尾追加：

```ts
test("search returns breadcrumb paths", async () => {
  const user = await seedUser();
  const dirA = await seedNode({ owner_id: user.id, name: "相册", is_dir: 1 });
  const dirB = await seedNode({ owner_id: user.id, parent_id: dirA.id, name: "2026", is_dir: 1 });
  const nested = await seedNode({ owner_id: user.id, parent_id: dirB.id, name: "聚会.jpg" });
  const top = await seedNode({ owner_id: user.id, name: "随笔.txt" });
  const res = await SELF.fetch("https://example.com/api/search?q=聚", { headers: await sessionHeaders(user) });
  const data = await res.json<{ paths: Record<string, string> }>();
  expect(data.paths[nested.id]).toBe("相册/2026/聚会.jpg");
  expect(data.paths[top.id]).toBe("随笔.txt");
});
```

（`seedNode` 导入若文件未有则补。）

- [ ] **Step 2: 跑测试确认失败**

```powershell
$env:WRANGLER_LOG_PATH="c:\Users\YMS\Documents\Code\cf-storage\.wrangler\logs"; npx vitest run test/search.test.ts
```

预期：新测试失败（响应无 paths，`data.paths[nested.id]` 为 undefined）。

- [ ] **Step 3: 实现**

`server/routes/search.ts` 改为（复用 `trash.ts` 导出的 `chunk`）：

```ts
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { chunk } from "./trash";

export const search = new Hono<AppEnv>();

search.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  // 去除 FTS5/LIKE 语法字符，按纯文本子串处理
  const safe = q.replace(/["'()*%_\\]/g, " ").trim();
  if (!safe) return c.json({ nodes: [], paths: {} });
  // trigram 分词要求查询 ≥3 码点且为整段子串；短查询退化为 LIKE
  let results;
  if ([...safe].length >= 3) {
    results = (await c.env.DB.prepare(
      `SELECT n.* FROM nodes_fts f JOIN nodes n ON n.id = f.node_id
       WHERE nodes_fts MATCH ?1 AND n.owner_id = ?2 AND n.deleted_at IS NULL
       ORDER BY n.updated_at DESC LIMIT 50`
    ).bind(`"${safe}"`, c.get("user").id).all()).results;
  } else {
    results = (await c.env.DB.prepare(
      `SELECT * FROM nodes WHERE owner_id = ?1 AND deleted_at IS NULL AND name LIKE ?2
       ORDER BY updated_at DESC LIMIT 50`
    ).bind(c.get("user").id, `%${safe}%`).all()).results;
  }
  // 面包屑：自节点向上回溯到顶级，路径含自身名、不含根哨兵（name=''）
  const paths: Record<string, string> = {};
  for (const part of chunk(results.map((r) => r.id as string), 90)) {
    const ph = part.map((_, i) => `?${i + 1}`).join(",");
    const { results: rows } = await c.env.DB.prepare(`
      WITH RECURSIVE up AS (
        SELECT id, parent_id, name, id AS root_id, name AS path FROM nodes WHERE id IN (${ph})
        UNION ALL
        SELECT n.id, n.parent_id, n.name, u.root_id, n.name || '/' || u.path
        FROM nodes n JOIN up u ON n.parent_id = u.id WHERE n.name != ''
      ) SELECT root_id, path FROM up WHERE parent_id = '' AND name != ''
    `).bind(...part).all<{ root_id: string; path: string }>();
    for (const row of rows) paths[row.root_id] = row.path;
  }
  return c.json({ nodes: results, paths });
});
```

要点：顶级节点 `parent_id=''`，其种子行即满足 `parent_id=''`；嵌套节点只有回溯到顶级目录那行满足（回溯到根哨兵前被 `n.name != ''` 拦住）。

- [ ] **Step 4: 全量验证**

```powershell
$env:WRANGLER_LOG_PATH="c:\Users\YMS\Documents\Code\cf-storage\.wrangler\logs"; npm test; npx tsc --noEmit
```

预期：全绿（96）。既有搜索测试（空查询 200 空列表等）不受影响——空查询现在多返回 `paths: {}`。

- [ ] **Step 5: 提交**

```powershell
git add server/routes/search.ts test/search.test.ts; git commit -m "feat: search returns breadcrumb paths"
```

> **审查记录（2026-09-27）**
>
> - 实现：655459f，98/98 测试绿 + tsc 零错误。
> - **计划 bug 修正 2 处（审查独立确认为正确）**：①递归 CTE 方向——计划 `ON n.parent_id = u.id` 是向下找子节点，嵌套路径恒 undefined，改为 `ON u.parent_id = n.id` 向上回溯；②计划测试数据下 `q=聚` 命中不到顶层文件致 `paths[top.id]` 不可达，改用 `q=.`（不在转义清洗表、LIKE 中为字面量，同时覆盖深/浅路径）。
> - 规格审查 PASS；质量审查 APPROVE：SQL 全参数化无注入面，chunk(90) 分片、空查询、FTS/LIKE 双分支无回归。建议级：孤儿节点静默无 path，前端消费时容忍缺键（Task 12 已用 `?? ""`）。

---

### Task 4: 后端补遗——公开分享子树浏览

spec §7.3「文件夹分享：访问者可浏览子树」。现有 `GET /api/s/:token` 只返回第一层 children。新增 `GET /api/s/:token/children/:dirId`：dirId 必须在分享根的子树内（含根本身）、未删除，返回该目录 children（走 `loadShare` 复用提取码/过期/吊销校验）。

**Files:**
- Modify: `server/routes/shares.ts`
- Test: `test/shares.test.ts`

- [ ] **Step 1: 写失败的测试**

`test/shares.test.ts` 末尾追加（沿用文件内 `upload/seedUser/seedNode/sessionHeaders` 与 POST /api/shares 建分享的模式）：

```ts
test("public share children browses subtree", async () => {
  const user = await seedUser();
  const dir = await seedNode({ owner_id: user.id, name: "share-root", is_dir: 1 });
  const sub = await seedNode({ owner_id: user.id, parent_id: dir.id, name: "sub", is_dir: 1 });
  const file = await seedNode({ owner_id: user.id, parent_id: sub.id, name: "a.txt", size: 3 });
  const created = await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(user)), "content-type": "application/json" },
    body: JSON.stringify({ nodeId: dir.id }),
  });
  const { token } = await created.json<{ token: string }>();
  const res = await SELF.fetch(`https://example.com/api/s/${token}/children/${sub.id}`);
  expect(res.status).toBe(200);
  const data = await res.json<{ name: string; children: { id: string; name: string }[] }>();
  expect(data.name).toBe("sub");
  expect(data.children.map((x) => x.id)).toContain(file.id);
  // 非子树目录 → 404
  const outsider = await seedNode({ owner_id: user.id, name: "outside", is_dir: 1 });
  const bad = await SELF.fetch(`https://example.com/api/s/${token}/children/${outsider.id}`);
  expect(bad.status).toBe(404);
  // 分享根自身可作为入口
  const rootSelf = await SELF.fetch(`https://example.com/api/s/${token}/children/${dir.id}`);
  expect(rootSelf.status).toBe(200);
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
$env:WRANGLER_LOG_PATH="c:\Users\YMS\Documents\Code\cf-storage\.wrangler\logs"; npx vitest run test/shares.test.ts
```

预期：新测试失败（路由 404）。

- [ ] **Step 3: 实现**

两处修改 `server/routes/shares.ts`：

① `publicShares.get("/:token")` 的 `base` 对象补 `id`（前端单文件分享页需要拿到 nodeId 拼下载 URL）：

```ts
  const base = {
    id: node.id,
    name: node.name,
    isDir: !!node.is_dir,
    size: node.size,
    mime: node.mime,
    hasPassword: !!share.password_hash,
    expiresAt: share.expires_at,
  };
```

② `publicShares` 中、`/:token/raw/:fileId` 路由之后追加子树浏览路由（`isDescendant/getNode/listChildren` 已在该文件导入）：

```ts
// 文件夹分享的子树浏览：dirId 必须在分享根子树内（含根本身）且未删除
publicShares.get("/:token/children/:dirId", async (c) => {
  const { node } = await loadShare(c, c.req.param("token"));
  if (!node.is_dir) throw errors.notFound();
  const dirId = c.req.param("dirId");
  if (!(await isDescendant(c.env.DB, node.owner_id, node.id, dirId))) throw errors.notFound();
  const dir = await getNode(c.env.DB, node.owner_id, dirId);
  if (!dir || !dir.is_dir || dir.deleted_at) throw errors.notFound();
  const children = await listChildren(c.env.DB, node.owner_id, dirId);
  return c.json({
    name: dir.name,
    children: children.map((x) => ({ id: x.id, name: x.name, isDir: !!x.is_dir, size: x.size, mime: x.mime })),
  });
});
```

- [ ] **Step 4: 全量验证**

```powershell
$env:WRANGLER_LOG_PATH="c:\Users\YMS\Documents\Code\cf-storage\.wrangler\logs"; npm test; npx tsc --noEmit
```

预期：全绿（97）。

- [ ] **Step 5: 提交**

```powershell
git add server/routes/shares.ts test/shares.test.ts; git commit -m "feat: public share subtree browsing"
```

> **审查记录（2026-09-27）**
>
> - 实现：cb73f23，99/99 测试绿 + tsc 零错误。
> - 偏离判定（均合理）：红测 401 系未匹配 /api/s/* 穿透 session 中间件的既有框架行为，非缺陷；测试写法沿用文件惯例（计划本要求如此）。
> - 规格审查 PASS；质量审查 APPROVE：loadShare 每请求执行（提取码不可绕过）；isDescendant 种子含根本身且有测试；isDescendant 先于 getNode 不泄露存在性；独立软删的子目录与回收站后代均被拒。可选增强（带提取码 children 401 用例）不强加。——后端补遗 4/4 闭环。

---

### Task 5: 前端脚手架（Vite + React + Tailwind + 双测试管线）

搭好 `client/` 应用骨架与测试管线，一条 smoke 测试跑通。此任务改动 `npm test` 语义（client+server 两段），之后所有前端任务用 `npm run test:client` / `npm run check`。

**Files:**
- Create: `vite.config.ts`、`vitest.client.config.ts`、`client/tsconfig.json`、`client/index.html`、`client/vite-env.d.ts`、`client/src/index.css`、`client/src/main.tsx`、`client/src/App.tsx`、`client/src/test/setup.ts`
- Modify: `package.json`（scripts + 依赖）

- [ ] **Step 1: 安装依赖**

```powershell
npm install react react-dom react-router-dom @tanstack/react-query
npm install -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @types/react @types/react-dom
```

- [ ] **Step 2: 写失败的测试**

`client/src/App.tsx` 暂为占位，`client/src/App.test.tsx`：

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "./App";

test("renders app title", () => {
  render(<App />);
  expect(screen.getByText("MStor")).toBeInTheDocument();
});
```

`client/src/test/setup.ts`：

```ts
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(() => cleanup());
```

- [ ] **Step 3: 配置并确认测试失败**

`vite.config.ts`（仓库根）：

```ts
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../client/dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/auth": "http://127.0.0.1:8787",
      "/dav": "http://127.0.0.1:8787",
    },
  },
});
```

`vitest.client.config.ts`（仓库根）：

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "client",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
```

`client/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite-env.d.ts"]
}
```

`client/vite-env.d.ts`：

```ts
/// <reference types="vite/client" />
```

`client/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MStor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`client/src/index.css`：

```css
@import "tailwindcss";
```

`client/src/main.tsx`：

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`client/src/App.tsx`：

```tsx
export default function App() {
  return <div className="p-4 text-lg font-bold">MStor</div>;
}
```

`package.json` scripts 改为（保留 test:server 语义）：

```json
"dev": "wrangler dev",
"dev:client": "vite",
"build": "vite build",
"deploy": "vite build && wrangler deploy",
"test": "npm run test:client && npm run test:server",
"test:server": "vitest run",
"test:client": "vitest run --config vitest.client.config.ts",
"test:watch": "vitest",
"check": "npm run check:server && npm run check:client",
"check:server": "tsc --noEmit",
"check:client": "tsc -p client --noEmit"
```

跑 `npm run test:client`：此时 Step 2 的测试与 Step 3 的配置齐备，预期 **1 passed**（本任务测试与配置一起落地，TDD 失败点由「模块不存在」天然成立——配置写错则此步直接暴露）。若 FAIL，先修配置再继续。

- [ ] **Step 4: 全量验证**

```powershell
npm run test:client; npm run test:server; npm run check; npm run build
```

预期：client 1 绿；server 97 绿；tsc 双零错误；`vite build` 产出 `client/dist/`（覆盖占位 index.html，这是预期——`wrangler dev` 与 deploy 用真产物）。

- [ ] **Step 5: 提交**

```powershell
git add package.json package-lock.json vite.config.ts vitest.client.config.ts client; git commit -m "feat: client scaffolding (vite, react, tailwind, dual test pipeline)"
```

> **审查记录（2026-09-27）**
>
> - 实现：45b2efc，四项验证全过（client 1 绿 / server 99 绿 / check 双零 / build 产出 dist）。
> - 偏离判定（均合理并实证）：①锁 vite@^7 + plugin-react@^5 + tailwindcss/vite@^4（plugin-react@6 强制 vite@8，与 vitest 3.2 冲突 ERESOLVE）；②服务端 vitest.config.ts 补 exclude `client/**`、`dist/**`——必要修复，否则根 vitest 捡到 client 测试致 jsdom 报错。
> - 规格审查 PASS；质量审查 APPROVE：双 tsconfig/vitest 隔离成立；代理路径与 run_worker_first 对应、8787 端口一致；实测 wrangler dev 对真产物 200。建议级：dist/index.html 引用带哈希 assets 不入库，fresh clone 需先 build 再 wrangler dev（部署清单前提，Task 17 收尾时与部署说明一并对齐）。

---

### Task 6: API 客户端 + 类型 + 应用骨架（/api/me、导航、401 跳转、Toast）

**Files:**
- Create: `client/src/api/client.ts`、`client/src/api/types.ts`、`client/src/api/me.ts`、`client/src/lib/format.ts`、`client/src/components/Toaster.tsx`、`client/src/shell/AppShell.tsx`
- Modify: `client/src/App.tsx`（路由 + RequireAuth）、`client/src/main.tsx`（QueryClient）
- Test: `client/src/api/client.test.ts`、`client/src/shell/AppShell.test.tsx`

- [ ] **Step 1: 类型与格式化工具（无测试，纯声明）**

`client/src/api/types.ts`：

```ts
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
}

export interface AdminUser {
  id: string;
  name: string;
  role: "admin" | "member";
  quota_bytes: number;
  created_at: number;
  disabled_at: number | null;
}

export interface Share {
  id: string;
  node_id: string;
  token: string;
  expires_at: number | null;
  downloads: number;
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
```

`client/src/lib/format.ts`：

```ts
export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 || v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("zh-CN");
}
```

- [ ] **Step 2: 写失败的 API 客户端测试**

`client/src/api/client.test.ts`：

```ts
import { afterEach, expect, test, vi } from "vitest";
import { ApiError, api } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("unwraps error envelope into ApiError", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ error: { code: "CONFLICT", message: "名称已存在" } }), { status: 409 }),
  ));
  const err: ApiError = await api("/api/dirs", { method: "POST", json: { name: "x" } }).then(
    () => { throw new Error("should reject"); },
    (e: ApiError) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(409);
  expect(err.code).toBe("CONFLICT");
  expect(err.message).toBe("名称已存在");
});

test("401 on protected api redirects to login", async () => {
  const loc = { href: "" };
  Object.defineProperty(window, "location", { value: loc, configurable: true });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
  await expect(api("/api/files")).rejects.toBeInstanceOf(ApiError);
  expect(loc.href).toBe("/auth/login");
});

test("401 on public share endpoint does NOT redirect", async () => {
  const loc = { href: "" };
  Object.defineProperty(window, "location", { value: loc, configurable: true });
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ error: { code: "SHARE_PASSWORD", message: "需要提取码" } }), { status: 401 }),
  ));
  const err: ApiError = await api("/api/s/tok").then(() => { throw new Error("should reject"); }, (e: ApiError) => e);
  expect(err.code).toBe("SHARE_PASSWORD");
  expect(loc.href).toBe("");
});

test("sends x-act-as header when set", async () => {
  localStorage.setItem("mstor_act_as", "u-123");
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await api("/api/files");
  const headers = fetchMock.mock.calls[0][1].headers as Headers;
  expect(headers.get("x-act-as")).toBe("u-123");
  localStorage.removeItem("mstor_act_as");
});
```

- [ ] **Step 3: 跑测试确认失败**

```powershell
npm run test:client
```

预期：FAIL（`./client` 模块不存在）。

- [ ] **Step 4: 实现 API 客户端**

`client/src/api/client.ts`：

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiInit extends Omit<RequestInit, "body"> {
  json?: unknown;
}

// 统一封装：错误 envelope → ApiError；受保护接口 401 → 跳登录（公开分享 /api/s/ 除外）
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (typeof localStorage !== "undefined") {
    const actAs = localStorage.getItem("mstor_act_as");
    if (actAs) headers.set("x-act-as", actAs);
  }
  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : (init.body as BodyInit | null | undefined),
  });
  if (res.status === 401 && !path.startsWith("/api/s/")) {
    window.location.href = "/auth/login";
    throw new ApiError(401, "UNAUTHORIZED", "请先登录");
  }
  if (!res.ok) {
    let code = "INTERNAL";
    let message = "请求失败";
    try {
      const data = (await res.json()) as { error?: { code?: string; message?: string } };
      code = data.error?.code ?? code;
      message = data.error?.message ?? message;
    } catch {
      // 非 JSON 错误体，保留默认文案
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}
```

`client/src/api/me.ts`：

```ts
import { api } from "./client";
import type { AdminUser, Me } from "./types";

export const getMe = () => api<Me>("/api/me");
export const setWebdavPassword = (password: string) => api<{ ok: true }>("/api/me/webdav-password", { method: "PUT", json: { password } });
export const listAdminUsers = () => api<{ users: AdminUser[] }>("/api/me/admin/users");
export const patchAdminUser = (
  id: string,
  body: { quota_bytes?: number; role?: "admin" | "member"; disabled?: boolean },
) => api<{ ok: true }>(`/api/me/admin/users/${id}`, { method: "PATCH", json: body });
```

- [ ] **Step 5: 跑 API 测试确认通过**

```powershell
npm run test:client
```

预期：5 passed（App smoke 1 + API 客户端 4）。

- [ ] **Step 6: 写失败的 shell 测试**

`client/src/shell/AppShell.test.tsx`：

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import AppShell from "./AppShell";

vi.mock("../api/me", () => ({
  getMe: async () => ({ id: "u1", name: "Alice", role: "admin", quotaBytes: 100, usedBytes: 40 }),
}));

function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("shows user name, quota and nav links", async () => {
  renderShell();
  expect(await screen.findByText("Alice")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "文件" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "回收站" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "分享" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "设置" })).toBeInTheDocument();
  expect(screen.getByText(/40 B/)).toBeInTheDocument(); // usedBytes
  expect(screen.getByRole("link", { name: "退出" })).toHaveAttribute("href", "/auth/logout");
});
```

- [ ] **Step 7: 跑测试确认失败**

```powershell
npm run test:client
```

预期：FAIL（AppShell 不存在）。

- [ ] **Step 8: 实现 Shell 与路由**

`client/src/components/Toaster.tsx`：

```tsx
import { useSyncExternalStore } from "react";

export interface ToastItem {
  id: number;
  message: string;
  kind: "error" | "info";
}

let toasts: ToastItem[] = [];
let listeners: Array<(t: ToastItem[]) => void> = [];
let seq = 0;

function emit() {
  for (const l of listeners) l(toasts);
}

export function toast(message: string, kind: "error" | "info" = "error") {
  const item = { id: ++seq, message, kind };
  toasts = [...toasts, item];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id);
    emit();
  }, 4000);
}

export function Toaster() {
  const items = useSyncExternalStore(
    (cb) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    },
    () => toasts,
  );
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 space-y-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded px-4 py-2 text-sm text-white shadow-lg ${t.kind === "error" ? "bg-red-600" : "bg-slate-800"}`}
          role="alert"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
```

`client/src/shell/AppShell.tsx`：

```tsx
import { MutationCache, QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { ApiError } from "../api/client";
import { getMe } from "../api/me";
import type { Me } from "../api/types";
import { formatBytes } from "../lib/format";
import { Toaster, toast } from "../components/Toaster";

export function makeQueryClient(): QueryClient {
  const onError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) return; // 已由 api() 跳登录
    toast(e instanceof Error ? e.message : "请求失败");
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

function useMe(): Me | undefined {
  const { data } = useQuery({ queryKey: ["me"], queryFn: getMe });
  return data;
}

const NAV = [
  { to: "/", label: "文件" },
  { to: "/trash", label: "回收站" },
  { to: "/shares", label: "分享" },
  { to: "/settings", label: "设置" },
];

export default function AppShell() {
  const me = useMe();
  if (!me) return <div className="p-8 text-center text-slate-500">加载中…</div>;
  const actAs = typeof localStorage !== "undefined" ? localStorage.getItem("mstor_act_as") : null;
  const pct = Math.min(100, Math.round((me.usedBytes / me.quotaBytes) * 100));
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-4 py-2">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-lg font-bold">MStor</span>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  `rounded px-2 py-1 ${isActive ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="hidden w-32 sm:block" title={`${formatBytes(me.usedBytes)} / ${formatBytes(me.quotaBytes)}`}>
              <div className="h-1.5 w-full rounded bg-slate-200">
                <div className={`h-1.5 rounded ${pct > 90 ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {formatBytes(me.usedBytes)} / {formatBytes(me.quotaBytes)}
              </div>
            </div>
            <span>{me.name}</span>
            <a href="/auth/logout" className="text-slate-500 hover:underline">
              退出
            </a>
          </div>
        </div>
        {actAs && (
          <div className="mx-auto mt-1 max-w-5xl rounded bg-amber-100 px-3 py-1 text-xs text-amber-800">
            正在以管理员身份查看「{me.name}」的空间
            <button
              className="ml-2 underline"
              onClick={() => {
                localStorage.removeItem("mstor_act_as");
                window.location.reload();
              }}
            >
              退出该空间
            </button>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet context={me} />
      </main>
      <Toaster />
    </div>
  );
}
```

`client/src/App.tsx`：

```tsx
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import { getMe } from "./api/me";
import AppShell, { makeQueryClient } from "./shell/AppShell";
import Browser from "./pages/Browser";

const queryClient = makeQueryClient();

// /api/me 401 时 api() 已跳转登录页；这里只负责加载态与 layout 挂载
function RequireAuth() {
  const { isPending } = useQuery({ queryKey: ["me"], queryFn: getMe });
  if (isPending) return <div className="p-8 text-center text-slate-500">加载中…</div>;
  return <AppShell />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/s/:token" element={<div />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Browser />} />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}
```

（layout 路由的 `element` 直接渲染 `<AppShell />`，子路由内容由 AppShell 内的 `<Outlet />` 承载。）

注意：`/s/:token` 与 Trash/Shares/Settings 页面在后续任务接入（Task 14/16/13），本任务先放 `<div />` 占位避免引入未实现页面；`Browser` 也先建占位文件 `client/src/pages/Browser.tsx`：

```tsx
export default function Browser() {
  return <div className="text-slate-500">文件（下一任务实现）</div>;
}
```

- [ ] **Step 9: 全量验证**

```powershell
npm run test:client; npm run test:server; npm run check
```

预期：client 全绿（App smoke + api 4 + shell 1 = 6），server 97 绿，双 tsc 零错误。

- [ ] **Step 10: 提交**

```powershell
git add client; git commit -m "feat: api client, app shell, auth flow"
```

> **审查记录（2026-09-27）**
>
> - 实现：07c43ac，client 6 绿 / server 99 绿 / check 双零。
> - **计划缺口修正**：main.tsx 补 BrowserRouter（计划 main.tsx 无 Router 但 App 用 Routes）；ApiInit 补回 body 字段（计划 Omit 又引用 init.body 自相矛盾）；setup.ts 补 localStorage polyfill（Node 实验性 webstorage 返回 undefined，jsdom 未覆盖）。
> - 规格审查 PASS；质量审查 APPROVE：认证/act-as/错误解析单点收敛于 api()；`/api/s/` 白名单经实证精确（/api/shares、/api/search 不受影响）；onError 对 401 静默与 api() 重定向互补。吹毛求疵：分享页 SHARE_PASSWORD 错误由组件内呈现（Task 16 设计如此）。

---

### Task 7: 文件列表页（面包屑、列表、新建文件夹、URL dir 参数）

**Files:**
- Create: `client/src/api/nodes.ts`、`client/src/hooks/useFiles.ts`、`client/src/hooks/useDebounce.ts`（本任务只建文件，搜索才用到 debounce——不，YAGNI：debounce 移到 Task 12。本任务不建此文件）、`client/src/components/FileList.tsx`、`client/src/components/Breadcrumb.tsx`、`client/src/components/NameDialog.tsx`
- Modify: `client/src/pages/Browser.tsx`
- Test: `client/src/pages/Browser.test.tsx`、`client/src/test/utils.tsx`

- [ ] **Step 1: 测试工具（renderWithProviders）**

`client/src/test/utils.tsx`：

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";

export function renderWithProviders(ui: ReactElement, { route = "/" } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}
```

- [ ] **Step 2: 写失败的测试**

`client/src/pages/Browser.test.tsx`（完整文件；URL 状态由 useSearchParams 内建，不额外断言以规避 jsdom navigation 噪音）：

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ListFilesResult, Node } from "../api/types";
import { renderWithProviders } from "../test/utils";
import Browser from "./Browser";

vi.mock("../api/nodes", () => ({
  listFiles: vi.fn(),
  createDir: vi.fn(),
}));

import { createDir, listFiles } from "../api/nodes";

function fileNode(over: Partial<Node> = {}): Node {
  return {
    id: "f1", parent_id: "", name: "hello.txt", is_dir: 0, size: 12,
    mime: "text/plain", created_at: 1, updated_at: 2, ...over,
  };
}

const ROOT_LIST: ListFilesResult = {
  nodes: [fileNode(), { ...fileNode(), id: "d1", name: "相册", is_dir: 1, size: null, mime: null }],
  breadcrumb: [],
  rootId: "root-1",
};

function renderWith(ui: React.JSX.Element) {
  const utils = renderWithProviders(ui);
  return { ...utils, user: userEvent.setup() };
}

test("lists files and navigates into folder", async () => {
  vi.mocked(listFiles).mockImplementation(async (parentId: string) =>
    parentId === ""
      ? ROOT_LIST
      : {
          nodes: [],
          breadcrumb: [{ id: "d1", parent_id: "", name: "相册", is_dir: 1, size: null, mime: null, created_at: 1, updated_at: 2 }],
          rootId: "root-1",
        },
  );
  const { user } = renderWith(<Browser />);
  expect(await screen.findByText("hello.txt")).toBeInTheDocument();
  expect(screen.getByText("相册")).toBeInTheDocument();
  await user.click(screen.getByText("相册"));
  await waitFor(() => expect(screen.getByText(/该目录为空/)).toBeInTheDocument());
});

test("create folder calls createDir and refreshes", async () => {
  // 失效后重新拉取的列表要包含新目录，才能断言刷新生效
  vi.mocked(listFiles).mockResolvedValue({
    ...ROOT_LIST,
    nodes: [...ROOT_LIST.nodes, fileNode({ id: "d2", name: "新建", is_dir: 1 })],
  });
  vi.mocked(createDir).mockResolvedValue(fileNode({ id: "d2", name: "新建", is_dir: 1 }));
  const { user } = renderWith(<Browser />);
  await screen.findByText("hello.txt");
  await user.click(screen.getByRole("button", { name: "新建文件夹" }));
  await user.type(screen.getByLabelText("名称"), "新建");
  await user.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(createDir).toHaveBeenCalledWith({ parentId: "", name: "新建" }));
  await waitFor(() => expect(screen.getByText("新建")).toBeInTheDocument());
});
```

- [ ] **Step 3: 跑测试确认失败**

```powershell
npm run test:client
```

预期：FAIL（`api/nodes` 的 listFiles/createDir 不存在、Browser 是占位）。

- [ ] **Step 4: 实现**

`client/src/api/nodes.ts`：

```ts
import { api } from "./client";
import type { ListFilesResult, Node } from "./types";

export const listFiles = (parentId: string) =>
  api<ListFilesResult>(`/api/files${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ""}`);

export const createDir = (body: { parentId?: string; name: string }) =>
  api<Node>("/api/dirs", { method: "POST", json: body });

export const renameNode = (id: string, name: string) =>
  api<{ ok: true }>(`/api/files/${id}`, { method: "PATCH", json: { name } });

export const moveNode = (id: string, parentId: string) =>
  api<{ ok: true }>(`/api/files/${id}`, { method: "PATCH", json: { parentId } });

export const deleteNode = (id: string) =>
  api<{ ok: true }>(`/api/files/${id}`, { method: "DELETE" });

export const contentUrl = (id: string, dl = false) => `/api/files/${id}/content${dl ? "?dl=1" : ""}`;
```

`client/src/hooks/useFiles.ts`：

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDir, deleteNode, listFiles, moveNode, renameNode } from "../api/nodes";

export function useFiles(parentId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["files", parentId], queryFn: () => listFiles(parentId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["files"] });

  const mkDir = useMutation({ mutationFn: (name: string) => createDir({ parentId, name }), onSuccess: invalidate });
  const rename = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => renameNode(id, name), onSuccess: invalidate });
  const move = useMutation({ mutationFn: ({ id, to }: { id: string; to: string }) => moveNode(id, to), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => deleteNode(id), onSuccess: invalidate });

  return { query, mkDir, rename, move, remove };
}
```

`client/src/components/NameDialog.tsx`（新建/重命名共用）：

```tsx
import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  initial?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

export default function NameDialog({ title, initial = "", onSubmit, onCancel, busy }: Props) {
  const [name, setName] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-80 rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 font-semibold">{title}</h2>
        <input
          ref={ref}
          aria-label="名称"
          className="w-full rounded border px-2 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSubmit(name.trim())}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2 text-sm">
          <button className="rounded px-3 py-1.5 hover:bg-slate-100" onClick={onCancel}>取消</button>
          <button
            className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
            disabled={!name.trim() || busy}
            onClick={() => onSubmit(name.trim())}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
```

`client/src/components/Breadcrumb.tsx`：

```tsx
import { Link } from "react-router-dom";
import type { Node } from "../api/types";

// crumbs 来自 /api/files 的 breadcrumb（不含根）；根固定为「全部文件」指向 /
export default function Breadcrumb({ crumbs }: { crumbs: Node[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-600" aria-label="面包屑">
      <Link to="/" className="hover:underline">全部文件</Link>
      {crumbs.map((c) => (
        <span key={c.id} className="flex items-center gap-1">
          <span className="text-slate-300">/</span>
          <Link to={`/?dir=${c.id}`} className="hover:underline">{c.name}</Link>
        </span>
      ))}
    </nav>
  );
}
```

`client/src/components/FileList.tsx`（本任务先渲染列表 + 下载链接；行操作区留 actions 插槽，Task 8/11/13 注入）：

```tsx
import type { ReactNode } from "react";
import { contentUrl } from "../api/nodes";
import type { Node } from "../api/types";
import { formatBytes, formatDate } from "../lib/format";

interface Props {
  nodes: Node[];
  onOpenDir: (id: string) => void;
  onOpenFile: (node: Node) => void;
  actions?: (node: Node) => ReactNode;
  emptyText?: string;
}

export default function FileList({ nodes, onOpenDir, onOpenFile, actions, emptyText = "该目录为空" }: Props) {
  if (!nodes.length) return <div className="py-16 text-center text-sm text-slate-400">{emptyText}</div>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-slate-500">
        <tr className="border-b">
          <th className="py-2">名称</th>
          <th className="hidden py-2 sm:table-cell">大小</th>
          <th className="hidden py-2 md:table-cell">修改时间</th>
          <th className="py-2" />
        </tr>
      </thead>
      <tbody>
        {nodes.map((n) => (
          <tr key={n.id} className="border-b hover:bg-slate-50">
            <td className="max-w-[12rem] py-2 sm:max-w-xs">
              <button className="truncate text-left hover:underline" onClick={() => (n.is_dir ? onOpenDir(n.id) : onOpenFile(n))}>
                {n.is_dir ? "📁" : "📄"} {n.name}
              </button>
            </td>
            <td className="hidden py-2 text-slate-500 sm:table-cell">{formatBytes(n.size)}</td>
            <td className="hidden py-2 text-slate-500 md:table-cell">{formatDate(n.updated_at)}</td>
            <td className="py-2 text-right">
              <span className="flex justify-end gap-2">
                {!n.is_dir && (
                  <a href={contentUrl(n.id, true)} className="text-blue-600 hover:underline" aria-label={`下载 ${n.name}`}>
                    下载
                  </a>
                )}
                {actions?.(n)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

`client/src/pages/Browser.tsx`：

```tsx
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Node } from "../api/types";
import Breadcrumb from "../components/Breadcrumb";
import FileList from "../components/FileList";
import NameDialog from "../components/NameDialog";
import { useFiles } from "../hooks/useFiles";

export default function Browser() {
  const [params, setParams] = useSearchParams();
  const dir = params.get("dir") ?? "";
  const { query, mkDir } = useFiles(dir);
  const [creating, setCreating] = useState(false);

  const openDir = (id: string) => setParams(id ? { dir: id } : {});

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">{query.data && <Breadcrumb crumbs={query.data.breadcrumb} />}</div>
        <button
          className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          onClick={() => setCreating(true)}
        >
          新建文件夹
        </button>
      </div>
      {query.isPending && <div className="py-16 text-center text-sm text-slate-400">加载中…</div>}
      {query.data && (
        <FileList nodes={query.data.nodes} onOpenDir={openDir} onOpenFile={() => {}} />
      )}
      {creating && (
        <NameDialog
          title="新建文件夹"
          busy={mkDir.isPending}
          onSubmit={(name) => mkDir.mutate(name, { onSuccess: () => setCreating(false) })}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: 全量验证**

```powershell
npm run test:client; npm run test:server; npm run check
```

预期：client 全绿（+2），其余不变。

- [ ] **Step 6: 提交**

```powershell
git add client; git commit -m "feat: file browser with breadcrumb and folder creation"
```

> **审查记录（2026-09-27）**
>
> - 实现：12251aa，client 8 绿 / server 99 绿 / check 双零。
> - 偏离判定（均成立，属计划适配缺陷）：JSX 类型导入（React 19 无 UMD 全局）；vi.mock 用 importOriginal 保留 contentUrl（全量 mock 会致 FileList 渲染崩）；断言带 emoji 前缀（testing-library 只匹配直接文本节点）。
> - 规格审查 PASS；质量审查 APPROVE：URL 编码、跨目录 invalidate、目录行无下载链接均核实。建议级：列表请求失败时页面静默空白（计划自身缺陷，Task 17 收尾统一补错误态）；Breadcrumb 链接未编码 dir id（UUID 无碍）。

---

### Task 8: 重命名、移动、删除（软删除）

**Files:**
- Create: `client/src/components/MoveDialog.tsx`
- Modify: `client/src/pages/Browser.tsx`（actions 注入）、`client/src/components/FileList.tsx`（不变——actions 插槽已备）
- Test: `client/src/pages/Browser.test.tsx`（追加）

- [ ] **Step 1: 写失败的测试**

`Browser.test.tsx` 追加（沿用文件内 `fileNode/ROOT_LIST/renderWith`）：

```tsx
test("rename via dialog calls renameNode", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  vi.mocked(renameNode).mockResolvedValue({ ok: true });
  const { user } = renderWith(<Browser />);
  await screen.findByText("hello.txt");
  await user.click(screen.getByRole("button", { name: /重命名 hello.txt/ }));
  const input = screen.getByLabelText("名称");
  await user.clear(input);
  await user.type(input, "world.txt");
  await user.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(renameNode).toHaveBeenCalledWith("f1", "world.txt"));
});

test("delete asks confirm then calls deleteNode", async () => {
  vi.mocked(listFiles).mockResolvedValue(ROOT_LIST);
  vi.mocked(deleteNode).mockResolvedValue({ ok: true });
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  const { user } = renderWith(<Browser />);
  await screen.findByText("hello.txt");
  await user.click(screen.getByRole("button", { name: /删除 hello.txt/ }));
  await waitFor(() => expect(deleteNode).toHaveBeenCalledWith("f1"));
  expect(confirmSpy).toHaveBeenCalled();
  vi.restoreAllMocks();
});

test("move via dialog calls moveNode with target dir", async () => {
  vi.mocked(listFiles).mockImplementation(async (parentId: string) =>
    parentId === "" ? ROOT_LIST : { nodes: [], breadcrumb: [], rootId: "root-1" },
  );
  vi.mocked(moveNode).mockResolvedValue({ ok: true });
  const { user } = renderWith(<Browser />);
  await screen.findByText("hello.txt");
  await user.click(screen.getByRole("button", { name: /移动 hello.txt/ }));
  await user.click(screen.getByRole("button", { name: "根目录" }));
  await waitFor(() => expect(moveNode).toHaveBeenCalledWith({ id: "f1", to: "" }));
});
```

测试文件顶部 `vi.mock("../api/nodes", ...)` 工厂补 `renameNode: vi.fn(), moveNode: vi.fn(), deleteNode: vi.fn(),`，import 行同步补。

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm run test:client
```

预期：新增 3 个 FAIL（行内按钮不存在）。

- [ ] **Step 3: 实现**

`client/src/components/MoveDialog.tsx`：

```tsx
import { useEffect, useState } from "react";
import { listFiles } from "../api/nodes";

export interface DirOption {
  id: string;
  name: string;
  depth: number;
}

// 家族规模目录数有限：打开时一次性递归拉取全部目录（深度上限 8 兜底）
export async function listDirOptions(excludeId?: string): Promise<DirOption[]> {
  const out: DirOption[] = [];
  async function walk(parentId: string, prefix: string, depth: number) {
    if (depth > 8) return;
    const { nodes } = await listFiles(parentId);
    for (const n of nodes.filter((x) => x.is_dir)) {
      if (n.id === excludeId) continue;
      const label = prefix ? `${prefix}/${n.name}` : n.name;
      out.push({ id: n.id, name: label, depth });
      await walk(n.id, label, depth + 1);
    }
  }
  await walk("", "", 0);
  return out;
}

interface Props {
  title: string;
  excludeId?: string;
  onSubmit: (targetId: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

export default function MoveDialog({ title, excludeId, onSubmit, onCancel, busy }: Props) {
  const [dirs, setDirs] = useState<DirOption[] | null>(null);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    listDirOptions(excludeId).then(setDirs);
  }, [excludeId]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-80 rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 font-semibold">{title}</h2>
        {!dirs ? (
          <div className="py-6 text-center text-sm text-slate-400">加载中…</div>
        ) : (
          <div className="max-h-64 space-y-0.5 overflow-auto" role="listbox" aria-label="目标目录">
            <button
              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-blue-50"
              onClick={() => setSelected("")}
              style={{ fontWeight: selected === "" ? 600 : 400 }}
            >
              根目录
            </button>
            {dirs.map((d) => (
              <button
                key={d.id}
                className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-blue-50"
                style={{ paddingLeft: `${d.depth * 16 + 8}px`, fontWeight: selected === d.id ? 600 : 400 }}
                onClick={() => setSelected(d.id)}
              >
                {d.name}
              </button>
            ))}
            {!dirs.length && <div className="px-2 py-1 text-xs text-slate-400">暂无其他文件夹</div>}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2 text-sm">
          <button className="rounded px-3 py-1.5 hover:bg-slate-100" onClick={onCancel}>取消</button>
          <button
            className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
            disabled={dirs === null || busy}
            onClick={() => onSubmit(selected)}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
```

`client/src/pages/Browser.tsx` 整体替换为：

```tsx
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Node } from "../api/types";
import Breadcrumb from "../components/Breadcrumb";
import FileList from "../components/FileList";
import MoveDialog from "../components/MoveDialog";
import NameDialog from "../components/NameDialog";
import { useFiles } from "../hooks/useFiles";

export default function Browser() {
  const [params, setParams] = useSearchParams();
  const dir = params.get("dir") ?? "";
  const { query, mkDir, rename, move, remove } = useFiles(dir);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Node | null>(null);
  const [moving, setMoving] = useState<Node | null>(null);

  const openDir = (id: string) => setParams(id ? { dir: id } : {});

  const confirmDelete = (node: Node) => {
    if (window.confirm(`确定删除「${node.name}」？可在回收站恢复。`)) remove.mutate(node.id);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">{query.data && <Breadcrumb crumbs={query.data.breadcrumb} />}</div>
        <button
          className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          onClick={() => setCreating(true)}
        >
          新建文件夹
        </button>
      </div>
      {query.isPending && <div className="py-16 text-center text-sm text-slate-400">加载中…</div>}
      {query.data && (
        <FileList
          nodes={query.data.nodes}
          onOpenDir={openDir}
          onOpenFile={() => {}}
          actions={(n) => (
            <>
              <button className="text-slate-600 hover:underline" aria-label={`重命名 ${n.name}`} onClick={() => setRenaming(n)}>
                重命名
              </button>
              <button className="text-slate-600 hover:underline" aria-label={`移动 ${n.name}`} onClick={() => setMoving(n)}>
                移动
              </button>
              <button className="text-red-600 hover:underline" aria-label={`删除 ${n.name}`} onClick={() => confirmDelete(n)}>
                删除
              </button>
            </>
          )}
        />
      )}
      {creating && (
        <NameDialog
          title="新建文件夹"
          busy={mkDir.isPending}
          onSubmit={(name) => mkDir.mutate(name, { onSuccess: () => setCreating(false) })}
          onCancel={() => setCreating(false)}
        />
      )}
      {renaming && (
        <NameDialog
          title={`重命名「${renaming.name}」`}
          initial={renaming.name}
          busy={rename.isPending}
          onSubmit={(name) => rename.mutate({ id: renaming.id, name }, { onSuccess: () => setRenaming(null) })}
          onCancel={() => setRenaming(null)}
        />
      )}
      {moving && (
        <MoveDialog
          title={`移动「${moving.name}」到…`}
          excludeId={moving.is_dir ? moving.id : undefined}
          busy={move.isPending}
          onSubmit={(to) => move.mutate({ id: moving.id, to }, { onSuccess: () => setMoving(null) })}
          onCancel={() => setMoving(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: 全量验证**

```powershell
npm run test:client; npm run test:server; npm run check
```

预期：client 全绿（+3）。

- [ ] **Step 5: 提交**

```powershell
git add client; git commit -m "feat: rename, move and soft delete from browser"
```

> **审查记录（2026-09-27）**
>
> - 实现：496f010，client 11 绿 / server 99 绿 / check 双零。
> - 偏离判定（均成立，系计划笔误/遗漏）：移动断言对齐真实签名 `moveNode(id, to)`；移动用例补「确定」提交步骤；emoji 文本断言。
> - 规格审查 PASS；质量审查 APPROVE：移动到自身子树=前端从简+后端 isDescendant 400 兜底（可接受）；失败时对话框留在原地可重试、错误走全局 toast；confirm 取消不发请求。建议级（不强加）：listDirOptions 未按前缀排除子孙目录（后端兜底）；MoveDialog useEffect 竞态影响极小。

---

### Task 9: 上传队列 + 小文件直传

**Files:**
- Create: `client/src/api/uploads.ts`、`client/src/hooks/useUploadQueue.ts`、`client/src/components/UploadPanel.tsx`
- Modify: `client/src/pages/Browser.tsx`（上传按钮）、`client/src/shell/AppShell.tsx`（挂 UploadPanel）
- Test: `client/src/hooks/useUploadQueue.test.tsx`

- [ ] **Step 1: 写失败的测试**

`client/src/hooks/useUploadQueue.test.tsx`：

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useUploadQueue } from "./useUploadQueue";

vi.mock("../api/uploads", () => ({
  uploadSmall: vi.fn(),
  uploadLarge: vi.fn(),
  SMALL_FILE_LIMIT: 1024,
}));

import { uploadLarge, uploadSmall } from "../api/uploads";

function makeFile(name: string, size: number): File {
  const f = new File(["x".repeat(Math.min(size, 8))], name, { type: "text/plain" });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test("uploads files sequentially and marks done", async () => {
  vi.mocked(uploadSmall).mockResolvedValue({ id: "n1", name: "a.txt", size: 5 });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("a.txt", 5)], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  expect(uploadSmall).toHaveBeenCalledWith(expect.any(File), "");
});

test("routes large files to uploadLarge and reports progress", async () => {
  vi.mocked(uploadLarge).mockImplementation(async (_f, _p, onProgress) => {
    onProgress?.(0.5);
    onProgress?.(1);
    return { nodeId: "n2", name: "big.bin" };
  });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("big.bin", 2048)], "d1"));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  expect(uploadLarge).toHaveBeenCalled();
  expect(result.current.items[0].progress).toBe(1);
});

test("failed upload is marked error and retry re-runs", async () => {
  vi.mocked(uploadSmall).mockRejectedValueOnce(new Error("配额不足")).mockResolvedValueOnce({ id: "n3", name: "a.txt", size: 5 });
  const { result } = renderHook(() => useUploadQueue(), { wrapper });
  act(() => result.current.add([makeFile("a.txt", 5)], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("error"));
  act(() => result.current.retry(result.current.items[0].key));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
});

test("invalidates files and me queries after success", async () => {
  vi.mocked(uploadSmall).mockResolvedValue({ id: "n1", name: "a.txt", size: 5 });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  const { result } = renderHook(() => useUploadQueue(), {
    wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
  act(() => result.current.add([makeFile("a.txt", 5)], ""));
  await waitFor(() => expect(result.current.items[0].status).toBe("done"));
  await waitFor(() => {
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey?: string[] })?.queryKey);
    expect(keys.some((k) => k?.[0] === "files")).toBe(true);
    expect(keys.some((k) => k?.[0] === "me")).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm run test:client
```

预期：FAIL（`useUploadQueue` 不存在）。

- [ ] **Step 3: 实现**

`client/src/api/uploads.ts`：

```ts
import { api } from "./client";
import type { InitUpload } from "./types";

// 与后端 wrangler.jsonc 的 SMALL_FILE_LIMIT 同步（60MB）
export const SMALL_FILE_LIMIT = 60 * 1024 * 1024;

export const uploadSmall = (file: File, parentId: string) => {
  const qs = new URLSearchParams({ name: file.name, parentId });
  return api<{ id: string; name: string; size: number }>(`/api/files/upload?${qs}`, {
    method: "PUT",
    body: file,
    headers: { "content-type": file.type || "application/octet-stream" },
  });
};

export interface Part {
  partNumber: number;
  etag: string;
}

export async function uploadLarge(
  file: File,
  parentId: string,
  onProgress?: (ratio: number) => void,
): Promise<{ nodeId: string; name: string }> {
  const { uploadId, partSize } = await api<InitUpload>("/api/uploads", {
    method: "POST",
    json: { parentId, name: file.name, size: file.size, mime: file.type || undefined },
  });
  const totalParts = Math.ceil(file.size / partSize);
  const parts: Part[] = [];
  let done = 0;
  let next = 1;
  const worker = async () => {
    while (next <= totalParts) {
      const partNumber = next++;
      parts.push({ partNumber, etag: await putPartWithRetry(file, uploadId, partNumber, partSize) });
      onProgress?.(++done / totalParts);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, totalParts) }, worker));
  return api<{ nodeId: string; name: string }>(`/api/uploads/${uploadId}/complete`, {
    method: "POST",
    json: { parts, mime: file.type || undefined },
  });
}

// spec §7.1：分片失败自动重试 3 次（指数退避），超限抛错由队列标记失败
async function putPartWithRetry(file: File, uploadId: string, partNumber: number, partSize: number): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const { urls } = await api<{ urls: string[] }>(`/api/uploads/${uploadId}/part-urls`, {
        method: "POST",
        json: { partNumbers: [partNumber] },
      });
      const start = (partNumber - 1) * partSize;
      const blob = file.slice(start, Math.min(start + partSize, file.size));
      const res = await fetch(urls[0], { method: "PUT", body: blob });
      if (!res.ok) throw new Error(`分片 ${partNumber} 直传失败：${res.status}`);
      return res.headers.get("etag") ?? (await res.text());
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

export const abortUpload = (uploadId: string) => api<{ ok: true }>(`/api/uploads/${uploadId}`, { method: "DELETE" });
```

`client/src/hooks/useUploadQueue.ts`：

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { SMALL_FILE_LIMIT, uploadLarge, uploadSmall } from "../api/uploads";

export type QueueStatus = "pending" | "uploading" | "done" | "error";

export interface QueueItem {
  key: number;
  name: string;
  size: number;
  parentId: string;
  file: File;
  status: QueueStatus;
  progress: number;
  error?: string;
}

export function useUploadQueue() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef<QueueItem[]>([]);
  const seq = useRef(0);
  const running = useRef(false);

  const update = useCallback((key: number, patch: Partial<QueueItem>) => {
    itemsRef.current = itemsRef.current.map((it) => (it.key === key ? { ...it, ...patch } : it));
    setItems([...itemsRef.current]);
  }, []);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    for (;;) {
      const next = itemsRef.current.find((it) => it.status === "pending");
      if (!next) break;
      update(next.key, { status: "uploading", error: undefined });
      try {
        if (next.file.size > SMALL_FILE_LIMIT) {
          await uploadLarge(next.file, next.parentId, (p) => update(next.key, { progress: p }));
        } else {
          await uploadSmall(next.file, next.parentId);
        }
        update(next.key, { status: "done", progress: 1 });
        void queryClient.invalidateQueries({ queryKey: ["files"] });
        void queryClient.invalidateQueries({ queryKey: ["me"] });
      } catch (e) {
        update(next.key, { status: "error", error: e instanceof Error ? e.message : "上传失败" });
      }
    }
    running.current = false;
  }, [queryClient, update]);

  const add = useCallback(
    (files: File[], parentId: string) => {
      itemsRef.current = [
        ...itemsRef.current,
        ...files.map((file) => ({
          key: ++seq.current, name: file.name, size: file.size,
          parentId, file, status: "pending" as QueueStatus, progress: 0,
        })),
      ];
      setItems([...itemsRef.current]);
      void drain();
    },
    [drain],
  );

  const retry = useCallback(
    (key: number) => {
      update(key, { status: "pending" });
      void drain();
    },
    [drain, update],
  );

  const clearFinished = useCallback(() => {
    itemsRef.current = itemsRef.current.filter((it) => it.status === "uploading" || it.status === "pending");
    setItems([...itemsRef.current]);
  }, []);

  return { items, add, retry, clearFinished };
}
```

`client/src/components/UploadPanel.tsx`：

```tsx
import type { useUploadQueue } from "../hooks/useUploadQueue";
import { formatBytes } from "../lib/format";

type Queue = ReturnType<typeof useUploadQueue>;

export default function UploadPanel({ queue }: { queue: Queue }) {
  if (!queue.items.length) return null;
  const active = queue.items.filter((i) => i.status === "pending" || i.status === "uploading").length;
  return (
    <div className="fixed right-4 bottom-4 z-30 w-72 rounded-lg border bg-white p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>上传{active > 0 ? `（${active} 个进行中）` : ""}</span>
        <button className="hover:underline" onClick={queue.clearFinished}>清空已完成</button>
      </div>
      <ul className="max-h-60 space-y-2 overflow-auto">
        {queue.items.map((it) => (
          <li key={it.key} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate" title={it.name}>{it.name}</span>
              <span className="shrink-0 text-slate-400">{formatBytes(it.size)}</span>
            </div>
            {it.status === "uploading" && (
              <div className="mt-1 h-1 rounded bg-slate-200">
                <div className="h-1 rounded bg-blue-500" style={{ width: `${Math.round(it.progress * 100)}%` }} />
              </div>
            )}
            {it.status === "done" && <div className="mt-1 text-green-600">完成</div>}
            {it.status === "error" && (
              <div className="mt-1 flex items-center justify-between text-red-600">
                <span className="truncate" title={it.error}>{it.error}</span>
                <button className="shrink-0 underline" onClick={() => queue.retry(it.key)}>重试</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

接线：`client/src/pages/Browser.tsx` 工具栏加文件选择（放在「新建文件夹」旁）：

```tsx
// 顶部补充：
import { useRef } from "react";
import { useUploadQueue } from "../hooks/useUploadQueue";

// 组件体内：
const fileInput = useRef<HTMLInputElement>(null);
const queue = useUploadQueue();

// 「新建文件夹」按钮后追加：
<input
  ref={fileInput}
  type="file"
  multiple
  className="hidden"
  onChange={(e) => {
    if (e.target.files?.length) queue.add(Array.from(e.target.files), dir);
    e.target.value = "";
  }}
/>
<button
  className="shrink-0 rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
  onClick={() => fileInput.current?.click()}
>
  上传
</button>
```

`client/src/shell/AppShell.tsx` **不改**——上传队列与面板都挂在 Browser 页内（页面切换即丢队列状态；spec 未要求后台续传，YAGNI）。在 Browser 组件末尾（对话框之前）追加：

```tsx
<UploadPanel queue={queue} />
// import 区补：import UploadPanel from "../components/UploadPanel";
```

- [ ] **Step 4: 全量验证**

```powershell
npm run test:client; npm run test:server; npm run check
```

预期：client 全绿（+4）。

- [ ] **Step 5: 提交**

```powershell
git add client; git commit -m "feat: upload queue with small-file direct upload"
```

> **审查记录（2026-09-27）**
>
> - 实现：77f5353，client 15 绿 / server 99 绿 / check 双零。
> - 偏离判定：仅 ReactNode 导入风格适配，成立。
> - 规格审查 PASS；质量审查 APPROVE：drain 防重入无竞态、parts 乱序依赖后端 complete 排序（安全）、QUOTA_EXCEEDED 透传可达、etag 可读性由 CORS ExposeHeaders 保障。建议级（已知取舍）：上传失败未调 abortUpload 清理服务端 pending 分片（uploadId 未透出，MVP 依赖 R2 生命周期/后续 cron；abortUpload 导出暂无调用方）。吹毛求疵：retry 不重置 progress。

---

### Task 10: 大文件分片直传接线（>60MB 自动分流）

`uploadLarge` 已在 Task 9 实现并有 hook 级测试。本任务补 ETag 解析与分流判断的单测（不需要真实 60MB 文件）。

**Files:**
- Modify: `client/src/api/uploads.ts`（无需改逻辑——仅当 Task 9 实现遗漏时补）
- Test: `client/src/api/uploads.test.ts`

- [ ] **Step 1: 写失败的测试**

`client/src/api/uploads.test.ts`：

```ts
import { afterEach, expect, test, vi } from "vitest";
import { SMALL_FILE_LIMIT, uploadLarge } from "./uploads";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeFile(name: string, size: number): File {
  const f = new File([new Uint8Array(Math.min(size, 16))], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("multipart flow: init, part-urls, direct PUT with etag, complete", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/uploads" && init?.method === "POST")
      return jsonRes({ uploadId: "up1", partSize: 8 }, 201);
    if (url === "/api/uploads/up1/part-urls")
      return jsonRes({ urls: [`https://r2.example/put?part=${JSON.parse(String(init?.body)).partNumbers[0]}`] });
    if (url.startsWith("https://r2.example/put"))
      return new Response(null, { status: 200, headers: { etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' } });
    if (url === "/api/uploads/up1/complete")
      return jsonRes({ nodeId: "n1", name: "big.bin" }, 201);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const res = await uploadLarge(makeFile("big.bin", 20), "d1", undefined, 0);
  expect(res).toEqual({ nodeId: "n1", name: "big.bin" });
  // 3 个分片（20B / 8B = ceil 2.5 → 3）
  const partCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("https://r2.example/put"));
  expect(partCalls).toHaveLength(3);
  const complete = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/uploads/up1/complete");
  const body = JSON.parse(String(complete![1].body)) as { parts: { partNumber: number; etag: string }[] };
  expect(body.parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
  expect(body.parts.every((p) => /^"[0-9a-f]{32}"$/.test(p.etag))).toBe(true);
});

test("part PUT failure retries then throws after 3 attempts", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/uploads") return jsonRes({ uploadId: "up2", partSize: 8 }, 201);
    if (url.endsWith("/part-urls")) return jsonRes({ urls: ["https://r2.example/fail"] });
    if (url.startsWith("https://r2.example/fail")) return new Response("err", { status: 500 });
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  await expect(uploadLarge(makeFile("big.bin", 10), "", undefined, 0)).rejects.toThrow("分片");
  // 1 次 init + 3 次 part-urls + 3 次 PUT = 7
  expect(fetchMock).toHaveBeenCalledTimes(7);
});

test("SMALL_FILE_LIMIT matches backend 60MB", () => {
  expect(SMALL_FILE_LIMIT).toBe(60 * 1024 * 1024);
});
```

- [ ] **Step 2: 跑测试确认失败/通过**

```powershell
npm run test:client
```

预期：本任务是 Task 9 网络层的覆盖性验证。若 FAIL（如重试次数不符、etag 未带引号），修 `client/src/api/uploads.ts` 至绿。重试的 `setTimeout` 用真实计时器会让测试等 ~3s——因此 `putPartWithRetry` 与 `uploadLarge` 需各加末参 `baseDelayMs = 1000` 并把退避改为 `setTimeout(r, baseDelayMs * 2 ** attempt)`（hook 调用处不变，测试传 0 加速）。

- [ ] **Step 3: 全量验证**

```powershell
npm run test:client; npm run test:server; npm run check
```

- [ ] **Step 4: 提交**

```powershell
git add client; git commit -m "test: multipart upload flow with retry coverage"
```

> **审查记录（2026-09-27）**
>
> - 实现：c19005f，client 18 绿 / server 99 绿 / check 双零。
> - 偏离判定：①重试用例 10B→8B 成立——2 分片双 worker 下 Promise.all 提前 reject，fetch 计数本质不确定（9-13 区间），单分片使「7 次」断言确定成立且覆盖不损失；②strict 防御写法无害；③baseDelayMs 默认 1000 生产行为不变。
> - 规格审查 PASS；质量审查 APPROVE：fetch mock 四段分流覆盖完整链路，etag 白名单断言与后端一致。吹毛求疵：测试 etag 正则少 i 标志（当前小写数据无影响）。

---

### Task 11: 下载与在线预览（图片/视频/音频/PDF/文本）

**Files:**
- Create: `client/src/lib/preview.ts`、`client/src/components/PreviewModal.tsx`
- Modify: `client/src/pages/Browser.tsx`（onOpenFile 打开预览）
- Test: `client/src/lib/preview.test.ts`、`client/src/components/PreviewModal.test.tsx`

- [ ] **Step 1: 写失败的测试**

`client/src/lib/preview.test.ts`：

```ts
import { expect, test } from "vitest";
import { previewKind } from "./preview";

test("maps mime to preview kind", () => {
  expect(previewKind("image/png")).toBe("image");
  expect(previewKind("video/mp4")).toBe("video");
  expect(previewKind("audio/mpeg")).toBe("audio");
  expect(previewKind("application/pdf")).toBe("pdf");
  expect(previewKind("text/plain")).toBe("text");
  expect(previewKind("application/json")).toBe("text");
  expect(previewKind("application/zip")).toBe("none");
  expect(previewKind(null)).toBe("none");
});
```

`client/src/components/PreviewModal.test.tsx`：

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Node } from "../api/types";
import PreviewModal from "./PreviewModal";

function node(over: Partial<Node> = {}): Node {
  return { id: "f1", parent_id: "", name: "f", is_dir: 0, size: 10, mime: "image/png", created_at: 1, updated_at: 2, ...over };
}

test("renders image with inline content url and download link", async () => {
  const { user } = setup(<PreviewModal node={node({ mime: "image/png", name: "pic.png" })} onClose={() => {}} />);
  expect(await screen.findByRole("img")).toHaveAttribute("src", "/api/files/f1/content");
  expect(screen.getByRole("link", { name: "下载" })).toHaveAttribute("href", "/api/files/f1/content?dl=1");
  await user.click(screen.getByRole("button", { name: "关闭" }));
});

test("renders video with controls", () => {
  render(<PreviewModal node={node({ mime: "video/mp4" })} onClose={() => {}} />);
  expect(document.querySelector("video[controls]")).toBeTruthy();
});

test("text preview fetches first 1MB and shows content", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("hello mstor", { status: 206 })));
  setup(<PreviewModal node={node({ mime: "text/plain", name: "a.txt" })} onClose={() => {}} />);
  expect(await screen.findByText("hello mstor")).toBeInTheDocument();
  const call = vi.mocked(fetch).mock.calls[0];
  expect((call[1] as RequestInit).headers).toEqual({ range: "bytes=0-1048575" });
  vi.unstubAllGlobals();
});

test("unknown mime falls back to download hint", async () => {
  setup(<PreviewModal node={node({ mime: "application/zip", name: "a.zip" })} onClose={() => {}} />);
  expect(await screen.findByText(/该文件类型不支持在线预览/)).toBeInTheDocument();
});

function setup(ui: React.JSX.Element) {
  const utils = render(ui);
  return { ...utils, user: userEvent.setup() };
}
```

（`video` 元素在 Testing Library 无内建 role，故用 `document.querySelector` 断言。）

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm run test:client
```

预期：FAIL（`lib/preview`、`components/PreviewModal` 不存在）。

- [ ] **Step 3: 实现**

`client/src/lib/preview.ts`：

```ts
export type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "none";

export function previewKind(mime: string | null | undefined): PreviewKind {
  const m = (mime ?? "").split(";")[0].trim();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("text/") || m === "application/json") return "text";
  return "none";
}
```

`client/src/components/PreviewModal.tsx`：

```tsx
import { useEffect, useState } from "react";
import { contentUrl } from "../api/nodes";
import type { Node } from "../api/types";
import { formatBytes } from "../lib/format";
import { previewKind } from "../lib/preview";

interface Props {
  node: Node;
  onClose: () => void;
}

// spec §7.2：文本截断前 1MB（后端支持 Range）
async function fetchTextHead(id: string): Promise<string> {
  const res = await fetch(contentUrl(id), { headers: { range: "bytes=0-1048575" } });
  if (!res.ok && res.status !== 206) throw new Error("加载失败");
  return res.text();
}

export default function PreviewModal({ node, onClose }: Props) {
  const kind = previewKind(node.mime);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (kind !== "text") return;
    fetchTextHead(node.id).then(setText).catch((e: Error) => setError(e.message));
  }, [kind, node.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black/70" onClick={onClose}>
      <div className="flex items-center justify-between bg-white px-4 py-2" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="truncate font-medium">{node.name}</div>
          <div className="text-xs text-slate-500">{formatBytes(node.size)}</div>
        </div>
        <div className="flex items-center gap-3">
          <a href={contentUrl(node.id, true)} className="text-sm text-blue-600 hover:underline">下载</a>
          <button aria-label="关闭" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-4" onClick={onClose}>
        <div className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
          {kind === "image" && <img src={contentUrl(node.id)} alt={node.name} className="max-h-[80vh] max-w-full object-contain" />}
          {kind === "video" && <video src={contentUrl(node.id)} controls className="max-h-[80vh] max-w-full" />}
          {kind === "audio" && <audio src={contentUrl(node.id)} controls className="w-80" />}
          {kind === "pdf" && <iframe src={contentUrl(node.id)} title={node.name} className="h-[80vh] w-[80vw] rounded bg-white" />}
          {kind === "text" && (
            <pre className="max-h-[80vh] w-[80vw] overflow-auto rounded bg-white p-4 text-sm">{error ? `加载失败：${error}` : (text ?? "加载中…")}</pre>
          )}
          {kind === "none" && (
            <div className="rounded bg-white px-8 py-12 text-center text-sm text-slate-500">
              该文件类型不支持在线预览，请使用左上角「下载」
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

接线 `Browser.tsx`：`const [preview, setPreview] = useState<Node | null>(null);`，`onOpenFile={setPreview}`，末尾渲染：

```tsx
{preview && <PreviewModal node={preview} onClose={() => setPreview(null)} />}
```

（import 区补 `import PreviewModal from "../components/PreviewModal";`。）

- [ ] **Step 4: 全量验证**

```powershell
npm run test:client; npm run test:server; npm run check
```

- [ ] **Step 5: 提交**

```powershell
git add client; git commit -m "feat: inline preview for image, video, audio, pdf, text"
```

> **审查记录（2026-09-27）**
>
> - 实现：3394b5a，client 23 绿 / server 99 绿 / check 双零。
> - 偏离判定（均成立）：测试 import 适配 + JSX 类型导入沿用项目模式。
> - 规格审查 PASS；质量审查 APPROVE：svg→image 无 XSS 面（<img> 子资源忽略 attachment 且不执行脚本）；Range 头有断言防回归。建议级（Task 17 顺手加固）：PreviewModal 加 `key={node.id}` 防 text 残留（当前不可达）；0 字节文本后端 416 → 前端可回空串提示。

---

### Task 12: 搜索（300ms 防抖、路径展示、点击跳转）

**Files:**
- Create: `client/src/api/search.ts`、`client/src/hooks/useDebounce.ts`、`client/src/components/SearchBox.tsx`
- Modify: `client/src/shell/AppShell.tsx`（头部挂 SearchBox）、`client/src/components/Toaster.tsx`（不动）
- Test: `client/src/components/SearchBox.test.tsx`

- [ ] **Step 1: 写失败的测试**

`client/src/components/SearchBox.test.tsx`：

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { SearchResult } from "../api/types";
import { renderWithProviders } from "../test/utils";
import SearchBox from "./SearchBox";

vi.mock("../api/search", () => ({
  searchNodes: vi.fn(),
}));

import { searchNodes } from "../api/search";

const RESULT: SearchResult = {
  nodes: [
    { id: "f1", parent_id: "d1", name: "聚会.jpg", is_dir: 0, size: 1, mime: "image/jpeg", created_at: 1, updated_at: 2 },
    { id: "d9", parent_id: "", name: "聚会资料", is_dir: 1, size: null, mime: null, created_at: 1, updated_at: 2 },
  ],
  paths: { f1: "相册/2026/聚会.jpg", d9: "聚会资料" },
};

test("debounces input then shows results with paths", async () => {
  vi.mocked(searchNodes).mockResolvedValue(RESULT);
  const { user } = renderWithProviders(<SearchBox />, { route: "/" });
  await user.type(screen.getByLabelText("搜索"), "聚会");
  await waitFor(() => expect(searchNodes).toHaveBeenCalledWith("聚会"), { timeout: 2000 });
  expect(await screen.findByText("相册/2026/聚会.jpg")).toBeInTheDocument();
  expect(screen.getByText("聚会资料")).toBeInTheDocument();
});

test("navigates to parent dir on file click", async () => {
  vi.mocked(searchNodes).mockResolvedValue(RESULT);
  const { user } = renderWithProviders(<SearchBox />, { route: "/" });
  await user.type(screen.getByLabelText("搜索"), "聚会");
  await screen.findByText("聚会.jpg");
  await user.click(screen.getByText("聚会.jpg"));
  // 点击后下拉收起（query 被清空）
  await waitFor(() => expect(screen.queryByText("相册/2026/聚会.jpg")).not.toBeInTheDocument());
});

test("does not search for empty/whitespace query", async () => {
  const { user } = renderWithProviders(<SearchBox />, { route: "/" });
  await user.type(screen.getByLabelText("搜索"), "   ");
  await new Promise((r) => setTimeout(r, 500));
  expect(searchNodes).not.toHaveBeenCalled();
});
```

`renderWithProviders` 需包 `MemoryRouter`（已具备）；SearchBox 内用 `useNavigate`，测试环境点击导航到 `/?dir=d1` 无副作用。

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm run test:client
```

预期：FAIL（`api/search`、`SearchBox` 不存在）。

- [ ] **Step 3: 实现**

`client/src/api/search.ts`：

```ts
import { api } from "./client";
import type { SearchResult } from "./types";

export const searchNodes = (q: string) => api<SearchResult>(`/api/search?q=${encodeURIComponent(q)}`);
```

`client/src/hooks/useDebounce.ts`：

```ts
import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
```

`client/src/components/SearchBox.tsx`：

```tsx
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchNodes } from "../api/search";
import { useDebounce } from "../hooks/useDebounce";

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounce(q, 300);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["search", dq],
    queryFn: () => searchNodes(dq),
    enabled: dq.trim().length > 0,
  });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (dirId: string | null) => {
    navigate(dirId ? `/?dir=${dirId}` : "/");
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        aria-label="搜索"
        placeholder="搜索文件名…"
        className="w-40 rounded border px-2 py-1 text-sm focus:w-56 focus:outline-none focus:ring-1 focus:ring-blue-400 sm:w-56"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && dq.trim() && (
        <div className="absolute right-0 z-30 mt-1 max-h-80 w-80 overflow-auto rounded border bg-white shadow-xl">
          {isFetching && <div className="px-3 py-2 text-xs text-slate-400">搜索中…</div>}
          {data?.nodes.length === 0 && !isFetching && <div className="px-3 py-2 text-xs text-slate-400">无结果</div>}
          {data?.nodes.map((n) => (
            <button
              key={n.id}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => go(n.is_dir ? n.id : n.parent_id || null)}
            >
              <div className="truncate">{n.is_dir ? "📁" : "📄"} {n.name}</div>
              <div className="truncate text-xs text-slate-400">{data.paths[n.id] ?? ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

接线 `AppShell.tsx`：头部导航与右侧用户区之间插入 `<SearchBox />`（`import SearchBox from "../components/SearchBox";`，放在 `<nav>` 之后）。注意 AppShell 测试此前 mock 了 `../api/me`——SearchBox 的搜索 query 只在输入后触发，AppShell.test 无需改；但若 testid 冲突报 `found multiple elements`，在 SearchBox input 的 aria-label 保持「搜索」即可（AppShell 无同名元素）。

- [ ] **Step 4: 全量验证**

```powershell
npm run test:client; npm run test:server; npm run check
```

预期：client 全绿（+3）。

- [ ] **Step 5: 提交**

```powershell
git add client; git commit -m "feat: debounced search with breadcrumb paths"
```

> **审查记录（2026-09-27）**
>
> - 实现：ca7eac1，client 26 绿 / server 99 绿 / check 双零。
> - 偏离判定（均成立）：renderWith 辅助、emoji 断言、第 3 用例 vi.clearAllMocks（config 无 clearMocks，防跨用例残留误报）。
> - 规格审查 PASS；质量审查 APPROVE：queryKey 按 dq 隔离无防抖竞态；go() 清空输入无多余请求；paths 缺键 `?? ""` 兑现 Task 3 建议。建议级（不强加）：点击后 300ms 内重聚焦可能闪现旧结果；无键盘导航（计划未要求）。

---

### Task 13: 分享对话框 + 我的分享管理

**Files:**
- Create: `client/src/api/shares.ts`、`client/src/components/ShareDialog.tsx`、`client/src/pages/SharesPage.tsx`
- Modify: `client/src/pages/Browser.tsx`（行操作加「分享」）、`client/src/App.tsx`（挂 /shares 路由）
- Test: `client/src/components/ShareDialog.test.tsx`、`client/src/pages/SharesPage.test.tsx`

- [ ] **Step 1: 写失败的测试**

`client/src/components/ShareDialog.test.tsx`：

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Node } from "../api/types";
import ShareDialog from "./ShareDialog";

vi.mock("../api/shares", () => ({
  createShare: vi.fn(),
}));

import { createShare } from "../api/shares";

function node(): Node {
  return { id: "f1", parent_id: "", name: "全家福.jpg", is_dir: 0, size: 10, mime: "image/jpeg", created_at: 1, updated_at: 2 };
}

test("creates share with expiry and password, shows url", async () => {
  vi.mocked(createShare).mockResolvedValue({ token: "tok123", url: "https://stor.msxor.com/s/tok123" });
  const { user } = renderWith(<ShareDialog node={node()} onClose={() => {}} />);
  await user.type(screen.getByLabelText("有效天数（可选）"), "7");
  await user.type(screen.getByLabelText("提取码（可选）"), "1234");
  await user.click(screen.getByRole("button", { name: "创建" }));
  await waitFor(() =>
    expect(createShare).toHaveBeenCalledWith({ nodeId: "f1", expiresInDays: 7, password: "1234" }),
  );
  expect(await screen.findByText(/\/s\/tok123/)).toBeInTheDocument();
});

function renderWith(ui: React.JSX.Element) {
  const utils = render(ui);
  return { ...utils, user: userEvent.setup() };
}
```

`client/src/pages/SharesPage.test.tsx`：

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Share } from "../api/types";
import { renderWithProviders } from "../test/utils";
import SharesPage from "./SharesPage";

vi.mock("../api/shares", () => ({
  listShares: vi.fn(),
  revokeShare: vi.fn(),
}));

import { listShares, revokeShare } from "../api/shares";

function share(over: Partial<Share> = {}): Share {
  return {
    id: "sh1", node_id: "f1", token: "tok-abc", expires_at: null, downloads: 3,
    created_at: 1, node_name: "全家福.jpg", node_is_dir: 0, node_size: 10, ...over,
  };
}

function renderWith(ui: React.JSX.Element) {
  const utils = renderWithProviders(ui);
  return { ...utils, user: userEvent.setup() };
}

test("lists shares with url, downloads and expiry", async () => {
  vi.mocked(listShares).mockResolvedValue({ shares: [share({ expires_at: 1893456000000 })] });
  renderWith(<SharesPage />);
  expect(await screen.findByText("全家福.jpg")).toBeInTheDocument();
  expect(screen.getByText(/tok-abc/)).toBeInTheDocument();
  expect(screen.getByText(/3/)).toBeInTheDocument(); // 下载次数（单元格内容含 3）
  expect(screen.getByText(/2029/)).toBeInTheDocument(); // 有效期至
});

test("revoke calls revokeShare and refreshes", async () => {
  // 首次返回一条，失效重拉后返回空，才能断言「暂无分享」
  vi.mocked(listShares).mockResolvedValueOnce({ shares: [share()] }).mockResolvedValue({ shares: [] });
  vi.mocked(revokeShare).mockResolvedValue({ ok: true });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { user } = renderWith(<SharesPage />);
  await screen.findByText("全家福.jpg");
  await user.click(screen.getByRole("button", { name: "撤销" }));
  await waitFor(() => expect(revokeShare).toHaveBeenCalledWith("sh1"));
  await waitFor(() => expect(screen.getByText(/暂无分享/)).toBeInTheDocument());
  vi.restoreAllMocks();
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm run test:client
```

预期：FAIL（`api/shares`、`ShareDialog`、`SharesPage` 不存在）。

- [ ] **Step 3: 实现**

`client/src/api/shares.ts`：

```ts
import { api } from "./client";
import type { PublicNode, Share, ShareInfo } from "./types";

export const createShare = (body: { nodeId: string; expiresInDays?: number; password?: string }) =>
  api<{ token: string; url: string }>("/api/shares", { method: "POST", json: body });

export const listShares = () => api<{ shares: Share[] }>("/api/shares");

export const revokeShare = (id: string) => api<{ ok: true }>(`/api/shares/${id}`, { method: "DELETE" });

// 公开分享（无需登录）：401 SHARE_PASSWORD / 410 SHARE_EXPIRED 由调用方按 code 分流
export const fetchShare = (token: string, password?: string) =>
  api<ShareInfo>(`/api/s/${token}`, password ? { headers: { "x-share-password": password } } : {});

export const fetchShareChildren = (token: string, dirId: string, password?: string) =>
  api<{ name: string; children: PublicNode[] }>(`/api/s/${token}/children/${dirId}`, password ? { headers: { "x-share-password": password } } : {});

// 受保护分享的下载无法用 <a> 带 header，统一走 blob
export async function downloadShared(token: string, fileId: string, name: string, password?: string): Promise<void> {
  const res = await fetch(`/api/s/${token}/raw/${fileId}`, password ? { headers: { "x-share-password": password } } : {});
  if (!res.ok) throw new Error("下载失败");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
```

`client/src/components/ShareDialog.tsx`：

```tsx
import { useState } from "react";
import { createShare } from "../api/shares";
import type { Node } from "../api/types";

interface Props {
  node: Node;
  onClose: () => void;
}

export default function ShareDialog({ node, onClose }: Props) {
  const [days, setDays] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await createShare({
        nodeId: node.id,
        expiresInDays: days ? Number(days) : undefined,
        password: password || undefined,
      });
      setUrl(res.url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-96 rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 font-semibold">分享「{node.name}」</h2>
        {url ? (
          <>
            <input readOnly value={url} className="w-full rounded border px-2 py-1.5 text-sm" onFocus={(e) => e.target.select()} />
            <button
              className="mt-2 w-full rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
              onClick={() => void navigator.clipboard.writeText(url)}
            >
              复制链接
            </button>
          </>
        ) : (
          <>
            <label className="mt-2 block text-xs text-slate-500">
              有效天数（可选，留空永久）
              <input
                aria-label="有效天数（可选）"
                type="number"
                min="1"
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
            <label className="mt-2 block text-xs text-slate-500">
              提取码（可选）
              <input
                aria-label="提取码（可选）"
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2 text-sm">
              <button className="rounded px-3 py-1.5 hover:bg-slate-100" onClick={onClose}>关闭</button>
              <button className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50" disabled={busy} onClick={() => void submit()}>
                创建
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

`client/src/pages/SharesPage.tsx`：

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listShares, revokeShare } from "../api/shares";
import { formatBytes } from "../lib/format";
import { formatDate } from "../lib/format";

export default function SharesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["shares"], queryFn: listShares });
  const revoke = useMutation({ mutationFn: revokeShare, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shares"] }) });

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">我的分享</h1>
      {!query.data?.shares.length && <div className="py-16 text-center text-sm text-slate-400">暂无分享</div>}
      <table className="w-full text-sm">
        <tbody>
          {query.data?.shares.map((s) => (
            <tr key={s.id} className="border-b">
              <td className="py-2">
                <div className="font-medium">{s.node_is_dir ? "📁" : "📄"} {s.node_name}</div>
                <div className="text-xs text-slate-400">/s/{s.token}</div>
              </td>
              <td className="hidden py-2 text-xs text-slate-500 sm:table-cell">
                {s.node_is_dir ? "文件夹" : formatBytes(s.node_size)}
                {" · "}已下载 {s.downloads} 次
                {s.expires_at ? ` · 有效期至 ${formatDate(s.expires_at)}` : " · 永久"}
              </td>
              <td className="py-2 text-right">
                <a href={`/s/${s.token}`} className="mr-3 text-blue-600 hover:underline" target="_blank" rel="noreferrer">
                  打开
                </a>
                <button
                  className="text-red-600 hover:underline"
                  onClick={() => window.confirm(`撤销「${s.node_name}」的分享？`) && revoke.mutate(s.id)}
                >
                  撤销
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

接线：`App.tsx` 的受保护路由组加 `<Route path="/shares" element={<SharesPage />} />`（import 同步）；`Browser.tsx` 的 actions 回调最前面加：

```tsx
<button className="text-slate-600 hover:underline" aria-label={`分享 ${n.name}`} onClick={() => setSharing(n)}>分享</button>
```

并加状态与渲染：`const [sharing, setSharing] = useState<Node | null>(null);` 与 `{sharing && <ShareDialog node={sharing} onClose={() => setSharing(null)} />}`。

- [ ] **Step 4: 全量验证**

```powershell
npm run test:client; npm run test:server; npm run check
```

预期：client 全绿（+3）。

- [ ] **Step 5: 提交**

```powershell
git add client; git commit -m "feat: share dialog and share management page"
```

---

### Task 14: 回收站页（恢复 / 彻底删除）

**Files:**
- Create: `client/src/api/trash.ts`、`client/src/pages/TrashPage.tsx`
- Modify: `client/src/App.tsx`（挂 /trash 路由）
- Test: `client/src/pages/TrashPage.test.tsx`

- [ ] **Step 1: 写失败的测试**

`client/src/pages/TrashPage.test.tsx`：

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Node } from "../api/types";
import { renderWithProviders } from "../test/utils";
import TrashPage from "./TrashPage";

vi.mock("../api/trash", () => ({
  listTrash: vi.fn(),
  restoreNode: vi.fn(),
  purgeNode: vi.fn(),
}));

import { listTrash, purgeNode, restoreNode } from "../api/trash";

function node(over: Partial<Node> = {}): Node {
  return {
    id: "t1", parent_id: "", name: "旧文件.txt", is_dir: 0, size: 5, mime: "text/plain",
    created_at: 1, updated_at: 2, deleted_at: 1700000000000, ...over,
  };
}

function renderWith(ui: React.JSX.Element) {
  const utils = renderWithProviders(ui);
  return { ...utils, user: userEvent.setup() };
}

test("lists trashed nodes with deleted date", async () => {
  vi.mocked(listTrash).mockResolvedValue({ nodes: [node()] });
  renderWith(<TrashPage />);
  expect(await screen.findByText("旧文件.txt")).toBeInTheDocument();
  expect(screen.getByText(/2023/)).toBeInTheDocument(); // deleted_at 年份
});

test("restore calls restoreNode and refreshes", async () => {
  // 首次返回一条，失效重拉后返回空，才能断言「回收站为空」
  vi.mocked(listTrash).mockResolvedValueOnce({ nodes: [node()] }).mockResolvedValue({ nodes: [] });
  vi.mocked(restoreNode).mockResolvedValue({ ok: true });
  const { user } = renderWith(<TrashPage />);
  await screen.findByText("旧文件.txt");
  await user.click(screen.getByRole("button", { name: "恢复" }));
  await waitFor(() => expect(restoreNode).toHaveBeenCalledWith("t1"));
  await waitFor(() => expect(screen.getByText(/回收站为空/)).toBeInTheDocument());
});

test("purge requires confirm", async () => {
  vi.mocked(listTrash).mockResolvedValue({ nodes: [node()] });
  vi.mocked(purgeNode).mockResolvedValue({ ok: true });
  const spy = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { user } = renderWith(<TrashPage />);
  await screen.findByText("旧文件.txt");
  await user.click(screen.getByRole("button", { name: "彻底删除" }));
  expect(purgeNode).not.toHaveBeenCalled();
  spy.mockReturnValue(true);
  await user.click(screen.getByRole("button", { name: "彻底删除" }));
  await waitFor(() => expect(purgeNode).toHaveBeenCalledWith("t1"));
  vi.restoreAllMocks();
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm run test:client
```

- [ ] **Step 3: 实现**

`client/src/api/trash.ts`：

```ts
import { api } from "./client";
import type { TrashResult } from "./types";

export const listTrash = () => api<TrashResult>("/api/trash");
export const restoreNode = (id: string) => api<{ ok: true }>(`/api/trash/${id}/restore`, { method: "POST" });
export const purgeNode = (id: string) => api<{ ok: true }>(`/api/trash/${id}`, { method: "DELETE" });
```

`client/src/pages/TrashPage.tsx`：

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTrash, purgeNode, restoreNode } from "../api/trash";
import type { Node } from "../api/types";
import FileList from "../components/FileList";
import { formatBytes, formatDate } from "../lib/format";

export default function TrashPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["trash"], queryFn: listTrash });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
    void queryClient.invalidateQueries({ queryKey: ["files"] });
  };
  const restore = useMutation({ mutationFn: restoreNode, onSuccess: invalidate });
  const purge = useMutation({ mutationFn: purgeNode, onSuccess: invalidate });

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">回收站</h1>
      <p className="mb-3 text-xs text-slate-400">回收站内容保留 30 天后自动清理；彻底删除不可恢复。</p>
      {query.isPending && <div className="py-16 text-center text-sm text-slate-400">加载中…</div>}
      {query.data && (
        <FileList
          nodes={query.data.nodes}
          onOpenDir={() => {}}
          onOpenFile={() => {}}
          emptyText="回收站为空"
          actions={(n: Node) => (
            <>
              <span className="hidden text-xs text-slate-400 lg:inline">
                {formatBytes(n.size)} · 删除于 {n.deleted_at ? formatDate(n.deleted_at) : "-"}
              </span>
              <button className="text-blue-600 hover:underline" onClick={() => restore.mutate(n.id)}>恢复</button>
              <button
                className="text-red-600 hover:underline"
                onClick={() => window.confirm(`彻底删除「${n.name}」？此操作不可恢复。`) && purge.mutate(n.id)}
              >
                彻底删除
              </button>
            </>
          )}
        />
      )}
    </div>
  );
}
```

接线：`App.tsx` 受保护路由组加 `<Route path="/trash" element={<TrashPage />} />`。

- [ ] **Step 4: 全量验证**

```powershell
npm run test:client; npm run test:server; npm run check
```

预期：client 全绿（+3）。

- [ ] **Step 5: 提交**

```powershell
git add client; git commit -m "feat: trash page with restore and purge"
```

---

### Task 15: 设置页（WebDAV 密码）+ admin 管理面板（配额/停用/进入空间）

**Files:**
- Create: `client/src/pages/SettingsPage.tsx`
- Modify: `client/src/App.tsx`（挂 /settings 路由）
- Test: `client/src/pages/SettingsPage.test.tsx`

- [ ] **Step 1: 写失败的测试**

`client/src/pages/SettingsPage.test.tsx`：

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, expect, test, vi } from "vitest";
import type { AdminUser, Me } from "../api/types";
import SettingsPage from "./SettingsPage";

vi.mock("../api/me", () => ({
  setWebdavPassword: vi.fn(),
  listAdminUsers: vi.fn(),
  patchAdminUser: vi.fn(),
}));

import { listAdminUsers, patchAdminUser, setWebdavPassword } from "../api/me";

const ME: Me = { id: "u-admin", name: "Alice", role: "admin", quotaBytes: 100, usedBytes: 10 };

function user(over: Partial<AdminUser> = {}): AdminUser {
  return { id: "u1", name: "Bob", role: "member", quota_bytes: 10737418240, created_at: 1, disabled_at: null, ...over };
}

function renderWith(ui: React.JSX.Element) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>), user: userEvent.setup() };
}

beforeAll(() => {
  // 「进入空间」用 window.location.assign 跳转，jsdom 需替换
  Object.defineProperty(window, "location", { value: { assign: vi.fn(), href: "" }, writable: true });
});

test("saves webdav password (min 8 chars enforced client-side)", async () => {
  vi.mocked(setWebdavPassword).mockResolvedValue({ ok: true });
  const { user } = renderWith(<SettingsPage me={ME} />);
  await screen.findByText("WebDAV");
  await user.type(screen.getByLabelText("WebDAV 应用密码"), "short");
  await user.click(screen.getByRole("button", { name: "保存密码" }));
  expect(setWebdavPassword).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("WebDAV 应用密码"), "123456789");
  await user.click(screen.getByRole("button", { name: "保存密码" }));
  await waitFor(() => expect(setWebdavPassword).toHaveBeenCalledWith("short123456789"));
});

test("admin edits quota via PATCH", async () => {
  vi.mocked(listAdminUsers).mockResolvedValue({ users: [user()] });
  vi.mocked(patchAdminUser).mockResolvedValue({ ok: true });
  const { user } = renderWith(<SettingsPage me={ME} />);
  await screen.findByText("Bob");
  const input = screen.getByLabelText("配额 GB（Bob）");
  await user.clear(input);
  await user.type(input, "20");
  await user.click(screen.getByRole("button", { name: /保存配额.*Bob/ }));
  await waitFor(() =>
    expect(patchAdminUser).toHaveBeenCalledWith("u1", { quota_bytes: 20 * 1024 ** 3 }),
  );
});

test("admin toggles disable and enters user space", async () => {
  vi.mocked(listAdminUsers).mockResolvedValue({ users: [user()] });
  vi.mocked(patchAdminUser).mockResolvedValue({ ok: true });
  const { user } = renderWith(<SettingsPage me={ME} />);
  await screen.findByText("Bob");
  await user.click(screen.getByRole("button", { name: "停用" }));
  await waitFor(() => expect(patchAdminUser).toHaveBeenCalledWith("u1", { disabled: true }));
  await user.click(screen.getByRole("button", { name: /进入空间/ }));
  expect(localStorage.getItem("mstor_act_as")).toBe("u1");
  localStorage.removeItem("mstor_act_as");
});
```

实现说明：`patchAdminUser` 断言 `{ quota_bytes: 20 * 1024 ** 3 }` —— 页面把 GB 输入换算为字节。`window.location` 的替换放 `beforeAll`（第三个用例点「进入空间」时 jsdom 无真实导航）。

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm run test:client
```

- [ ] **Step 3: 实现**

`client/src/pages/SettingsPage.tsx`：

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listAdminUsers, patchAdminUser, setWebdavPassword } from "../api/me";
import type { AdminUser, Me } from "../api/types";
import { formatDate } from "../lib/format";
import { toast } from "../components/Toaster";

function WebdavSection() {
  const [password, setPassword] = useState("");
  const save = useMutation({
    mutationFn: setWebdavPassword,
    onSuccess: () => {
      toast("WebDAV 密码已更新", "info");
      setPassword("");
    },
  });
  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="mb-1 font-semibold">WebDAV</h2>
      <p className="mb-3 text-xs text-slate-500">
        地址 <code>/dav/</code>，用户名同登录名；在 Windows 映射驱动器 / iOS 文件 App 中使用。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="WebDAV 应用密码"
          type="password"
          placeholder="至少 8 位"
          className="w-56 rounded border px-2 py-1.5 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={password.length < 8 || save.isPending}
          onClick={() => save.mutate(password)}
        >
          保存密码
        </button>
        {password.length > 0 && password.length < 8 && <span className="text-xs text-red-500">密码至少 8 位</span>}
      </div>
    </section>
  );
}

function AdminRow({ u, selfId }: { u: AdminUser; selfId: string }) {
  const queryClient = useQueryClient();
  const [gb, setGb] = useState(String(Math.round(u.quota_bytes / 1024 ** 3)));
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  const patch = useMutation({
    mutationFn: (body: Parameters<typeof patchAdminUser>[1]) => patchAdminUser(u.id, body),
    onSuccess: invalidate,
  });
  return (
    <tr className="border-b">
      <td className="py-2">
        {u.name}
        {u.id === selfId && <span className="ml-1 text-xs text-slate-400">（我）</span>}
        {u.disabled_at && <span className="ml-1 text-xs text-red-500">已停用</span>}
      </td>
      <td className="py-2 text-xs">{u.role}</td>
      <td className="py-2">
        <input
          aria-label={`配额 GB（${u.name}）`}
          type="number"
          min="0"
          className="w-24 rounded border px-2 py-1 text-sm"
          value={gb}
          onChange={(e) => setGb(e.target.value)}
        />
        <button
          className="ml-2 text-xs text-blue-600 hover:underline"
          onClick={() => patch.mutate({ quota_bytes: Math.max(0, Number(gb)) * 1024 ** 3 })}
        >
          保存配额（{u.name}）
        </button>
      </td>
      <td className="py-2 text-xs text-slate-400">{formatDate(u.created_at)}</td>
      <td className="py-2 text-right">
        <button
          className="mr-3 text-slate-600 hover:underline"
          onClick={() => {
            localStorage.setItem("mstor_act_as", u.id);
            window.location.assign("/");
          }}
        >
          进入空间
        </button>
        <button
          className={u.disabled_at ? "text-blue-600 hover:underline" : "text-red-600 hover:underline"}
          onClick={() => patch.mutate({ disabled: !u.disabled_at })}
        >
          {u.disabled_at ? "启用" : "停用"}
        </button>
      </td>
    </tr>
  );
}

export default function SettingsPage({ me }: { me: Me }) {
  const users = useQuery({ queryKey: ["admin-users"], queryFn: listAdminUsers, enabled: me.role === "admin" });
  return (
    <div className="space-y-4">
      <WebdavSection />
      {me.role === "admin" && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 font-semibold">用户管理</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b">
                <th className="py-2">用户</th>
                <th className="py-2">角色</th>
                <th className="py-2">配额</th>
                <th className="py-2">注册</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {users.data?.users.map((u) => <AdminRow key={u.id} u={u} selfId={me.id} />)}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
```

接线：`App.tsx` 受保护路由组改为通过 `useRouteLoaderData` 不便——直接在 `App.tsx` 加一个包装组件：

```tsx
function SettingsRoute() {
  const me = useOutletContext<Me>();
  return <SettingsPage me={me} />;
}
```

（`AppShell` 的 `<Outlet context={me} />` 已备；`import { useOutletContext } from "react-router-dom";`。）路由表加 `<Route path="/settings" element={<SettingsRoute />} />`。

- [ ] **Step 4: 全量验证**

```powershell
npm run test:client; npm run test:server; npm run check
```

预期：client 全绿（+3）。

- [ ] **Step 5: 提交**

```powershell
git add client; git commit -m "feat: settings page with webdav password and admin panel"
```

---

### Task 16: 公开分享页 /s/:token（提取码门、子树浏览、下载）

**Files:**
- Create: `client/src/pages/SharePage.tsx`
- Modify: `client/src/App.tsx`（`/s/:token` 占位替换为 SharePage）
- Test: `client/src/pages/SharePage.test.tsx`

- [ ] **Step 1: 写失败的测试**

`client/src/pages/SharePage.test.tsx`：

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { PublicNode, ShareInfo } from "../api/types";
import { ApiError } from "../api/client";
import { renderWithProviders } from "../test/utils";
import SharePage from "./SharePage";

vi.mock("../api/shares", async () => ({
  ...(await vi.importActual<typeof import("../api/shares")>("../api/shares")),
  fetchShare: vi.fn(),
  fetchShareChildren: vi.fn(),
  downloadShared: vi.fn(),
}));

import { downloadShared, fetchShare, fetchShareChildren } from "../api/shares";

function info(over: Partial<ShareInfo> = {}): ShareInfo {
  return {
    id: "p1",
    name: "相册", isDir: true, size: null, mime: null, hasPassword: false, expiresAt: null,
    children: [
      { id: "p1", name: "日落.jpg", isDir: false, size: 100, mime: "image/jpeg" },
      { id: "p2", name: "子目录", isDir: true, size: null, mime: null },
    ],
    ...over,
  };
}

function renderWith(ui: React.JSX.Element, route = "/s/tok123") {
  const utils = renderWithProviders(ui, { route });
  return { ...utils, user: userEvent.setup() };
}

test("renders folder share and browses into subdirectory", async () => {
  vi.mocked(fetchShare).mockResolvedValue(info());
  vi.mocked(fetchShareChildren).mockResolvedValue({ name: "子目录", children: [{ id: "p3", name: "内部.txt", isDir: false, size: 3, mime: "text/plain" }] });
  const { user } = renderWith(<SharePage />);
  expect(await screen.findByText("相册")).toBeInTheDocument();
  expect(screen.getByText("日落.jpg")).toBeInTheDocument();
  await user.click(screen.getByText("子目录"));
  expect(await screen.findByText("内部.txt")).toBeInTheDocument();
  expect(fetchShareChildren).toHaveBeenCalledWith("tok123", "p2", undefined);
  // 面包屑可回根
  await user.click(screen.getByRole("button", { name: /相册/ }));
  await waitFor(() => expect(screen.getByText("日落.jpg")).toBeInTheDocument());
});

test("password gate: asks code then retries with header", async () => {
  vi.mocked(fetchShare)
    .mockRejectedValueOnce(new ApiError(401, "SHARE_PASSWORD", "需要提取码"))
    .mockResolvedValue(info({ hasPassword: true, children: [{ id: "p1", name: "机密.pdf", isDir: false, size: 1, mime: "application/pdf" }] }));
  const { user } = renderWith(<SharePage />);
  expect(await screen.findByText(/需要提取码/)).toBeInTheDocument();
  await user.type(screen.getByLabelText("提取码"), "8888");
  await user.click(screen.getByRole("button", { name: "解锁" }));
  expect(await screen.findByText("机密.pdf")).toBeInTheDocument();
  expect(fetchShare).toHaveBeenLastCalledWith("tok123", "8888");
});

test("shows expired and revoked states", async () => {
  vi.mocked(fetchShare).mockRejectedValue(new ApiError(410, "SHARE_EXPIRED", "分享已过期"));
  renderWith(<SharePage />);
  expect(await screen.findByText(/分享已过期/)).toBeInTheDocument();
});

test("file click downloads via blob helper", async () => {
  vi.mocked(fetchShare).mockResolvedValue(info({ isDir: false, name: "single.jpg", children: undefined }));
  const { user } = renderWith(<SharePage />);
  await screen.findByText("single.jpg");
  await user.click(screen.getByRole("button", { name: /下载 single.jpg/ }));
  await waitFor(() => expect(downloadShared).toHaveBeenCalledWith("tok123", "p1", "single.jpg", undefined));
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npm run test:client
```

- [ ] **Step 3: 实现**

`client/src/pages/SharePage.tsx`：

```tsx
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { downloadShared, fetchShare, fetchShareChildren } from "../api/shares";
import type { PublicNode } from "../api/types";
import { formatBytes } from "../lib/format";

interface Crumb {
  id: string;
  name: string;
}

export default function SharePage() {
  const { token = "" } = useParams();
  const [password, setPassword] = useState("");
  const [entered, setEntered] = useState(false);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [current, setCurrent] = useState<{ id: string; name: string } | null>(null);

  const info = useQuery({
    queryKey: ["share", token, entered ? password : ""],
    queryFn: () => fetchShare(token, entered ? password : undefined),
    retry: false,
  });

  const needsPassword = info.error instanceof ApiError && info.error.code === "SHARE_PASSWORD";
  const expired = info.error instanceof ApiError && info.error.status === 410;
  const gone = info.error instanceof ApiError && !needsPassword && !expired && info.error.status === 404;

  const children = useQuery({
    queryKey: ["share-children", token, current?.id ?? "", password],
    queryFn: () => fetchShareChildren(token, current!.id, password || undefined),
    enabled: !!current,
  });

  if (info.isPending) return <div className="p-10 text-center text-sm text-slate-400">加载中…</div>;
  if (needsPassword && !entered)
    return (
      <div className="mx-auto mt-24 w-80 rounded-lg border bg-white p-6 text-center shadow">
        <p className="mb-3 text-sm">该分享需要提取码</p>
        <input
          aria-label="提取码"
          className="w-full rounded border px-2 py-1.5 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="mt-3 w-full rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
          onClick={() => setEntered(true)}
        >
          解锁
        </button>
      </div>
    );
  if (expired || gone)
    return <div className="mt-24 text-center text-sm text-slate-500">{expired ? "分享链接已过期" : "分享不存在或已被撤销"}</div>;
  if (info.error) return <div className="mt-24 text-center text-sm text-slate-500">加载失败：{info.error.message}</div>;
  if (!info.data) return null;

  // 文件夹分享：current 决定层级；单文件分享：仅展示自身（id 来自 ShareInfo，供拼 raw 下载）
  const files: PublicNode[] = current
    ? (children.data?.children ?? [])
    : info.data.isDir
      ? (info.data.children ?? [])
      : [{ id: info.data.id, name: info.data.name, isDir: false, size: info.data.size, mime: info.data.mime }];
  const title = current ? current.name : info.data.name;

  const download = (f: PublicNode) => {
    void downloadShared(token, f.id, f.name, password || undefined);
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-xl font-bold">MStor 分享</h1>
      <p className="mb-4 text-sm text-slate-500">
        共享对象：{info.data.name}
        {info.data.expiresAt ? ` · 有效期至 ${new Date(info.data.expiresAt).toLocaleDateString("zh-CN")}` : ""}
      </p>
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button className="hover:underline" onClick={() => { setCurrent(null); setCrumbs([]); }}>{info.data.name}</button>
        {crumbs.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className="text-slate-300">/</span>
            <button
              className="hover:underline"
              onClick={() => {
                setCrumbs(crumbs.slice(0, i + 1));
                setCurrent(c);
              }}
            >
              {c.name}
            </button>
          </span>
        ))}
        {current && <span className="text-slate-500">（当前）</span>}
      </nav>
      <table className="w-full text-sm">
        <tbody>
          {files.map((f) => (
            <tr key={f.id} className="border-b">
              <td className="py-2">
                {f.isDir ? (
                  <button
                    className="text-left hover:underline"
                    onClick={() => {
                      setCrumbs([...crumbs, { id: current?.id ?? "", name: title }]);
                      setCurrent({ id: f.id, name: f.name });
                    }}
                  >
                    📁 {f.name}
                  </button>
                ) : (
                  <span>📄 {f.name}</span>
                )}
              </td>
              <td className="py-2 text-xs text-slate-400">{formatBytes(f.size)}</td>
              <td className="py-2 text-right">
                {!f.isDir && (
                  <button className="text-blue-600 hover:underline" onClick={() => download(f)}>
                    下载 {f.name}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!files.length && <tr><td colSpan={3} className="py-10 text-center text-sm text-slate-400">空文件夹</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
```

接线：`App.tsx` 把 `<Route path="/s/:token" element={<div />} />` 替换为 `<Route path="/s/:token" element={<SharePage />} />`（import 同步）。

- [ ] **Step 4: 全量验证**

```powershell
npm run test:client; npm run test:server; npm run check
```

预期：client 全绿（+4）。

- [ ] **Step 5: 提交**

```powershell
git add client; git commit -m "feat: public share page with password gate and subtree browsing"
```

---

### Task 17: PWA + 构建收尾

**Files:**
- Create: `client/public/icon.svg`
- Modify: `vite.config.ts`（VitePWA 插件）、`client/vite-env.d.ts`（virtual 类型）、`client/src/main.tsx`（SW 注册）、`package.json`（依赖）

- [ ] **Step 1: 安装依赖**

```powershell
npm install -D vite-plugin-pwa
```

- [ ] **Step 2: 写失败的测试/断言**

构建级验证为主：`client/src/main.test.tsx`（新增，断言 PWA 注册逻辑模块可导入且 PROD 下调用 registerSW——用模块 mock）：

```tsx
import { expect, test, vi } from "vitest";

const registerMock = vi.fn();
vi.mock("virtual:pwa-register", () => ({ registerSW: registerMock }));

test("pwa registration module is wired", async () => {
  // main.tsx 仅在 PROD 注册；这里直接验证虚拟模块类型与 mock 通道可用
  vi.stubEnv("PROD", "true");
  await import("./main");
  // jsdom 下 main.tsx 会渲染 root——只需断言导入不抛错
  expect(true).toBe(true);
});
```

说明：jsdom 中 `import("./main")` 会执行 `createRoot(document.getElementById("root")!)`——jsdom 无 `#root`（index.html 不在测试环境加载），`getElementById` 返回 null 会抛错。为可测，`main.tsx` 改为守卫式：

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

if (import.meta.env.PROD) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}
```

且测试环境 `import.meta.env.PROD` 为 false（vitest 默认），不触发虚拟模块导入——测试改为只验证「导入不抛错 + root 缺失时安全跳过」，`vi.mock("virtual:pwa-register")` 保留即可（PROD=false 不会用到，mock 是防御性的）。最终 `client/src/main.test.tsx`：

```tsx
import { expect, test } from "vitest";

test("main module imports safely without #root", async () => {
  await expect(import("./main")).resolves.toBeDefined();
});
```

- [ ] **Step 3: 实现 PWA 配置**

`client/public/icon.svg`：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#2563eb"/>
  <path d="M160 336a72 72 0 0 1-8-143 104 104 0 0 1 200-28 80 80 0 0 1 24 155z" fill="#fff"/>
  <rect x="184" y="272" width="144" height="16" rx="8" fill="#2563eb"/>
  <rect x="248" y="216" width="16" height="104" rx="8" fill="#2563eb"/>
  <path d="M232 288l24 24 24-24" fill="none" stroke="#2563eb" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

`vite.config.ts` 加插件（import 区补 `import { VitePWA } from "vite-plugin-pwa";`，plugins 数组加）：

```ts
VitePWA({
  registerType: "autoUpdate",
  manifest: {
    name: "MStor 家庭云盘",
    short_name: "MStor",
    description: "基于 Cloudflare R2 的私有云盘",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  },
  workbox: { navigateFallbackDenylist: [/^\/api\//, /^\/dav\//, /^\/auth\//] },
}),
```

`client/vite-env.d.ts` 追加一行：

```ts
/// <reference types="vite-plugin-pwa/client" />
```

`wrangler.jsonc` 不需要改（assets 目录不变；SW 的 navigateFallback 由 workbox 处理 SPA 路由，`/api` 等已排除）。

- [ ] **Step 4: 全量验证 + 构建**

```powershell
npm run test:client; npm run test:server; npm run check; npm run build
```

预期：全部绿；`client/dist/` 含 `index.html`、`icon.svg`、`sw.js`、`manifest.webmanifest`。抽查 `dist/index.html` 引用了 manifest。

- [ ] **Step 5: 手动冒烟（人工操作，不阻塞合码）**

1. `npm run dev:server` + `npm run dev:client`，浏览器开 `http://localhost:5173`：登录跳转 → 文件浏览 → 上传小文件 → 预览图片/文本 → 新建文件夹 → 重命名/移动/删除 → 搜索 → 分享（含提取码）→ 回收站恢复。
2. `npm run build; npm run dev`（wrangler dev 8787 托管产物）再冒烟公开分享页 `/s/<token>`。
3. iOS Safari「添加到主屏幕」检查 manifest 生效（可后续真机验证）。

- [ ] **Step 6: 提交**

```powershell
git add client vite.config.ts package.json package-lock.json; git commit -m "feat: pwa manifest, service worker and build polish"
```

---

## 计划自审记录

**Spec 覆盖对照**（spec 前端相关条目 → 任务）：
- §2 文件管理（浏览/上传/下载/删除/重命名/新建文件夹）→ Task 7/8/9/11
- §2/§7.2 在线预览（图片/视频音频 Range/PDF/文本前 1MB）→ Task 11
- §2/§7.1 上传双通道（≤60MB 直传；>60MB 分片 3 并发 + 重试 3 次指数退避）→ Task 9/10
- §2/§7.3 外部分享（有效期/提取码/撤销/无需登录/子树浏览）→ Task 4（后端）+ Task 13/16
- §2/§7.4 回收站（软删/恢复/彻底删除；30 天自动清理在后端 cron）→ Task 8/14
- §2/§7.5 搜索（FTS5 + 300ms 防抖 + 面包屑路径）→ Task 3（后端 paths）+ Task 12
- §2/§6 多用户（独立隔离 = 后端强制注入；admin 配额/停用/切换空间）→ Task 1/2（后端）+ Task 15
- §2/§6 WebDAV 应用密码（生成/重置）→ Task 15（后端 PUT /api/me/webdav-password 已有）
- §2 移动端 PWA（响应式 + 可添加主屏幕）→ 响应式类贯穿 Task 6-16（hidden sm:table-cell 等）+ Task 17（manifest/SW）
- §8 错误处理（TanStack Query 全局 toast；401 跳登录）→ Task 6（QueryCache/MutationCache onError + api() 401 重定向）
- §4 TanStack Query / TailwindCSS / vite-plugin-pwa → Task 5/6/17

**已知取舍**（有意为之）：分享页对文件一律走 blob 下载（受保护分享无法用 `<a>` 带 header；MVP 不做访客端内联预览）；上传队列挂在 Browser 页内、页面切换丢失（spec 未要求后台续传）；admin 进入空间期间 `/api/me` 返回被查看者信息（中间件整体换 user，属预期行为）；文本预览前 1MB（spec §7.2）。

**类型一致性**：`api()`/`ApiError`（Task 6）被全部 api 模块使用；`Node/ListFilesResult/Me/AdminUser/Share/ShareInfo（含 id）/PublicNode/SearchResult/TrashResult/InitUpload`（Task 6）全计划一致；`useUploadQueue` 的 `QueueItem{key,name,size,parentId,file,status,progress,error}` 与 UploadPanel/测试一致；`uploadLarge(file, parentId, onProgress?, baseDelayMs?)` 与 Task 10 测试签名一致；`fetchShare/fetchShareChildren/downloadShared(token, id, name, password?)`（Task 13 定义）与 Task 16 调用一致；`ShareInfo.id` 由 Task 4 ①（base 补 id）提供，Task 16 单文件下载依赖它；后端 `paths`/`x-act-as`/`disabled`/`children/:dirId` 契约在 Task 1-4 落地后生效。

**执行顺序约束**：Task 1-4（后端补遗）必须先于 Task 15/16（前端消费 disabled_at、x-act-as、children/:dirId、search paths）；Task 5-6 是其余前端任务的地基；Task 9 先于 Task 10。



