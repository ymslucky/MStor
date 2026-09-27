# MStor 后端实现计划（Worker API + WebDAV）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Cloudflare Workers 上实现 MStor 全部后端能力：OIDC 登录、文件管理、双通道上传、Range 下载、回收站、搜索、分享、WebDAV 网关、用户/配额管理。

**Architecture:** 单体 Worker（Hono）+ R2 binding（文件）+ D1（元数据）+ aws4fetch 动态签发 S3 预签名 URL。R2 key = `{userId}/{nodeId}`，路径由 D1 `nodes` 树表达。设计文档：`docs/superpowers/specs/2026-09-27-r2-nas-design.md`。

**Tech Stack:** Hono 4、TypeScript、D1、R2、aws4fetch、@cloudflare/vitest-pool-workers。

**前置条件（一次性人工操作，非代码任务）：**
- `npx wrangler login`
- `npx wrangler r2 bucket create mstor`
- `npx wrangler d1 create mstor` → 把返回的 `database_id` 填入 `wrangler.jsonc`
- `npx wrangler r2 bucket cors set mstor --file cors.json`（cors.json 在 Task 18 创建后再执行）
- 生产 secrets：`npx wrangler secret put OIDC_CLIENT_SECRET` 等 4 个（Task 1 文件清单已列出）

---

## 文件结构总览

```
server/
  index.ts              # 入口：Hono app + scheduled（回收站清理）
  env.ts                # Env / App 类型
  types.ts              # DB 行类型
  lib/
    errors.ts           # HttpError + 统一错误中间件
    crypto.ts           # pbkdf2、随机 token、base64url、sha256
    nodes.ts            # 节点 CRUD、子树/面包屑 CTE、配额
    r2.ts               # aws4fetch 客户端、multipart 签名/执行
    davxml.ts           # WebDAV 207 XML 构造
  middleware/
    session.ts          # session JWT 校验
    admin.ts            # admin 守卫
    davauth.ts          # WebDAV Basic Auth
  routes/
    auth.ts             # /auth/login /auth/callback
    files.ts            # /api/files /api/dirs /api/search
    uploads.ts          # /api/uploads（分片直传）
    trash.ts            # /api/trash 回收站
    shares.ts           # /api/shares + 公开 /api/s/:token
    me.ts               # /api/me + /api/admin/users
    dav.ts              # /dav/*
migrations/0001_init.sql
test/
  setup.ts              # 应用 D1 migrations
  helpers.ts            # 造用户/造 session/造目录
  *.test.ts
cors.json
client/dist/index.html  # 占位（assets 目录需存在）
```

---

### Task 1: 项目脚手架 + 健康检查

**Files:**
- Create: `package.json`, `wrangler.jsonc`, `tsconfig.json`, `vitest.config.ts`, `server/index.ts`, `server/env.ts`, `server/types.ts`, `client/dist/index.html`, `test/health.test.ts`, `.gitignore`

- [ ] **Step 1: 写入项目配置文件**

`package.json`：

```json
{
  "name": "mstor",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "build": "vite build",
    "deploy": "vite build && wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "aws4fetch": "^1.0.20",
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.8.19",
    "@cloudflare/workers-types": "^4.20250901.0",
    "typescript": "^5.6.0",
    "vitest": "^3.2.0",
    "wrangler": "^4.0.0"
  }
}
```

`wrangler.jsonc`：

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "mstor",
  "main": "server/index.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./client/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/auth/*", "/dav/*", "/s/*"]
  },
  "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "mstor" }],
  "d1_databases": [{ "binding": "DB", "database_name": "mstor", "database_id": "由 wrangler d1 create 返回后填入" }],
  "triggers": { "crons": ["0 3 * * *"] },
  "vars": {
    "OIDC_ISSUER": "https://auth.msxor.com",
    "OIDC_CLIENT_ID": "mstor",
    "PUBLIC_URL": "https://stor.msxor.com",
    "R2_ENDPOINT": "https://<ACCOUNT_ID>.r2.cloudflarestorage.com/mstor",
    "DEFAULT_QUOTA_BYTES": "10737418240",
    "SMALL_FILE_LIMIT": "62914560",
    "TRASH_RETENTION_DAYS": "30"
  }
}
```

`.gitignore`：

```
node_modules/
.wrangler/
client/node_modules/
client/dist/
```

注意：`client/dist/index.html` 是占位文件，需强制保留（`!client/dist/index.html` 追加到 .gitignore 末尾）。

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"]
  },
  "include": ["server", "test"]
}
```

- [ ] **Step 2: 写入最小服务端代码**

`server/types.ts`：

```ts
export interface UserRow {
  id: string;
  oidc_sub: string;
  name: string;
  role: "admin" | "member";
  webdav_password_hash: string | null;
  quota_bytes: number;
  created_at: number;
}

export interface NodeRow {
  id: string;
  owner_id: string;
  parent_id: string; // "" = 用户根目录哨兵值
  name: string;
  is_dir: 0 | 1;
  r2_key: string | null;
  size: number | null;
  mime: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface ShareRow {
  id: string;
  node_id: string;
  token: string;
  password_hash: string | null;
  expires_at: number | null;
  downloads: number;
  created_at: number;
  revoked_at: number | null;
}

export interface UploadRow {
  id: string;
  owner_id: string;
  parent_id: string;
  name: string;
  size: number;
  r2_key: string;
  r2_upload_id: string;
  status: "pending" | "done";
  created_at: number;
}
```

`server/env.ts`：

```ts
import type { Hono } from "hono";
import type { UserRow } from "./types";

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  OIDC_ISSUER: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
  PUBLIC_URL: string;
  SESSION_SECRET: string;
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  DEFAULT_QUOTA_BYTES: string;
  SMALL_FILE_LIMIT: string;
  TRASH_RETENTION_DAYS: string;
};

export type AppEnv = { Bindings: Env; Variables: { user: UserRow } };
export type App = Hono<AppEnv>;
```

`server/index.ts`：

```ts
import { Hono } from "hono";
import type { AppEnv, Env } from "./env";

const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.resolve());
  },
} satisfies ExportedHandler<Env>;
```

`client/dist/index.html`：

```html
<!doctype html><html><body>MStor placeholder</body></html>
```

- [ ] **Step 3: 写失败的健康检查测试**

`test/health.test.ts`：

```ts
import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";

test("GET /api/health returns ok", async () => {
  const res = await SELF.fetch("https://example.com/api/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
```

`vitest.config.ts`（本任务暂不启用 migrations setup，Task 2 再加）：

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            SESSION_SECRET: "test-session-secret",
            OIDC_CLIENT_SECRET: "test-oidc-secret",
            R2_ACCESS_KEY_ID: "test-r2-key",
            R2_SECRET_ACCESS_KEY: "test-r2-secret",
          },
        },
      },
    },
  },
});
```

- [ ] **Step 4: 安装依赖并运行测试**

Run: `npm install` 然后 `npm test`
Expected: 1 passed（health 测试绿）。若报 `database_id` 无效，先完成前置条件里 `wrangler d1 create mstor` 并回填。

- [ ] **Step 5: Commit**

```bash
git add package.json wrangler.jsonc tsconfig.json vitest.config.ts server test .gitignore client/dist/index.html
git commit -m "chore: scaffold MStor worker with health check"
```

---

### Task 2: D1 迁移（4 张表 + FTS5）

**Files:**
- Create: `migrations/0001_init.sql`, `test/setup.ts`, `test/cloudflare-test.d.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: 写迁移 SQL**

`migrations/0001_init.sql`：

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  oidc_sub TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  webdav_password_hash TEXT,
  quota_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  is_dir INTEGER NOT NULL CHECK (is_dir IN (0,1)),
  r2_key TEXT,
  size INTEGER,
  mime TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE (owner_id, parent_id, name)
);
CREATE INDEX idx_nodes_owner_deleted ON nodes(owner_id, deleted_at);

CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  expires_at INTEGER,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX idx_shares_node ON shares(node_id);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  r2_upload_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  created_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE nodes_fts USING fts5(node_id UNINDEXED, name, tokenize = 'trigram');
CREATE TRIGGER nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(node_id, name) VALUES (new.id, new.name);
END;
CREATE TRIGGER nodes_ad AFTER DELETE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE node_id = old.id;
END;
CREATE TRIGGER nodes_au AFTER UPDATE OF name ON nodes BEGIN
  DELETE FROM nodes_fts WHERE node_id = old.id;
  INSERT INTO nodes_fts(node_id, name) VALUES (new.id, new.name);
END;
```

设计要点：`parent_id` 用空串 `''` 作根哨兵（非 NULL），使 `UNIQUE(owner_id, parent_id, name)` 对根目录同样生效；`nodes.id` 为应用层 `crypto.randomUUID()`。FTS5 用 trigram 分词（支持 CJK 子串匹配），同步触发器用普通 DELETE（D1 的 SQLite 不支持 FTS5 `'delete'` 特殊命令，实测报错）。

- [ ] **Step 2: 写测试 setup 并接入 vitest**

`test/setup.ts`：

```ts
import { applyD1Migrations, env } from "cloudflare:test";
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

`vitest.config.ts` 的 `test` 块加入：

```ts
setupFiles: ["./test/setup.ts"],
```

- [ ] **Step 3: 本地应用迁移**

Run: `npx wrangler d1 migrations apply mstor --local`
Expected: `0001_init.sql` applied。

- [ ] **Step 4: 验证测试仍绿**

Run: `npm test`
Expected: 1 passed（health）。

- [ ] **Step 5: Commit**

```bash
git add migrations test/setup.ts vitest.config.ts
git commit -m "feat: D1 schema for users/nodes/shares/uploads + FTS5"
```

---

### Task 3: lib/crypto（PBKDF2 / token / base64url）

**Files:**
- Create: `server/lib/crypto.ts`, `test/crypto.test.ts`

- [ ] **Step 1: 写失败测试**

`test/crypto.test.ts`：

```ts
import { expect, test } from "vitest";
import { pbkdf2Hash, pbkdf2Verify, randomToken, sha256B64Url } from "../server/lib/crypto";

test("pbkdf2 hash/verify roundtrip", async () => {
  const stored = await pbkdf2Hash("secret-password");
  expect(stored.startsWith("pbkdf2$")).toBe(true);
  expect(await pbkdf2Verify("secret-password", stored)).toBe(true);
  expect(await pbkdf2Verify("wrong", stored)).toBe(false);
});

test("randomToken is url-safe", () => {
  const t = randomToken(16);
  expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
});

test("sha256B64Url matches known vector", async () => {
  // sha256("abc") = rmBG8+G9XZHEEhKYGk6dSAy5dTGZfdaMvYYFWEYFve4 之前 44 字符去 padding
  expect(await sha256B64Url("abc")).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- crypto`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`server/lib/crypto.ts`：

```ts
const enc = new TextEncoder();

export function randomToken(bytes = 16): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64(d: Uint8Array): string {
  let s = "";
  for (const c of d) s += String.fromCharCode(c);
  return btoa(s);
}

export function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function pbkdf2Hash(password: string, iterations = 100_000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(await derive(password, salt, iterations))}`;
}

export async function pbkdf2Verify(password: string, stored: string): Promise<boolean> {
  const [, iters, saltB64, hashB64] = stored.split("$");
  const hash = b64(await derive(password, unb64(saltB64), Number(iters)));
  // 等长比较防时序
  if (hash.length !== hashB64.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ hashB64.charCodeAt(i);
  return diff === 0;
}

export async function sha256B64Url(input: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(input)));
  return b64(d).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- crypto`
Expected: 3 passed。

- [ ] **Step 5: Commit**

```bash
git add server/lib/crypto.ts test/crypto.test.ts
git commit -m "feat: crypto helpers (pbkdf2/token/sha256)"
```

---

### Task 4: 统一错误处理

**Files:**
- Create: `server/lib/errors.ts`, `test/errors.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 写失败测试**

`test/errors.test.ts`：

```ts
import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { Hono } from "hono";
import { errors, errorHandler } from "../server/lib/errors";

test("errorHandler formats HttpError", async () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.get("/boom", () => { throw errors.conflict("名称已存在"); });
  const res = await app.request("/boom");
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: { code: "CONFLICT", message: "名称已存在" } });
});

test("unknown errors become 500 envelope", async () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.get("/boom", () => { throw new Error("x"); });
  const res = await app.request("/boom");
  expect(res.status).toBe(500);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INTERNAL");
});

test("health still ok via SELF (error handler wired)", async () => {
  const res = await SELF.fetch("https://example.com/api/health");
  expect(res.status).toBe(200);
});

test("unmatched route returns 404 envelope via SELF", async () => {
  const res = await SELF.fetch("https://example.com/api/nope");
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "资源不存在" } });
});
```

> **实现注意（Task 4 双审结论）**：hono 4.13 的 `compose` 对每层 handler 单独 try/catch 并直接路由到 app 级 `onError`，因此「try/catch 包 `await next()`」式 errorMiddleware **收不到路由 handler 抛出的错误**——必须用 `app.onError(errorHandler)`。另外 workers-types 将 `Response.json()` 类型化为 `Promise<unknown>`，对其取属性前需类型断言。

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- errors`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`server/lib/errors.ts`：

```ts
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class HttpError extends Error {
  constructor(public status: ContentfulStatusCode, public code: string, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export const errors = {
  unauthorized: () => new HttpError(401, "UNAUTHORIZED", "请先登录"),
  forbidden: () => new HttpError(403, "FORBIDDEN", "无权访问"),
  quotaExceeded: () => new HttpError(403, "QUOTA_EXCEEDED", "空间配额不足"),
  notFound: () => new HttpError(404, "NOT_FOUND", "资源不存在"),
  conflict: (m = "名称已存在") => new HttpError(409, "CONFLICT", m),
  badRequest: (m = "请求参数错误") => new HttpError(400, "BAD_REQUEST", m),
};

export async function errorHandler(e: Error, c: Context) {
  if (e instanceof HttpError) {
    return c.json({ error: { code: e.code, message: e.message } }, e.status);
  }
  console.error(e);
  return c.json({ error: { code: "INTERNAL", message: "服务器内部错误" } }, 500);
}
```

`server/index.ts` 修改（health 路由之前）：

```ts
app.onError(errorHandler);
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "资源不存在" } }, 404));
```

（`app.onError` 全局生效，覆盖 `/api/*`、`/auth/*` 及未来所有路由；`app.notFound` 补上未匹配路由的统一 envelope——`onError` 覆盖不到 Hono 内置 404 路径。）

- [ ] **Step 4: 运行确认通过**

Run: `npm test`（另跑 `npx tsc --noEmit` 确认类型干净）
Expected: 全部 passed。

- [ ] **Step 5: Commit**

```bash
git add server/lib/errors.ts server/index.ts test/errors.test.ts
git commit -m "feat: unified error envelope middleware"
```

---

### Task 5: lib/nodes（节点核心操作）

**Files:**
- Create: `server/lib/nodes.ts`, `test/nodes.test.ts`, `test/helpers.ts`

- [ ] **Step 1: 写测试辅助（造用户 + 根目录）**

`test/helpers.ts`：

```ts
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
```

- [ ] **Step 2: 写失败测试**

`test/nodes.test.ts`：

```ts
import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import {
  assertQuota, breadcrumb, createDir, ensureRootDir, getNode, listChildren,
  moveNode, subtreeIds, uniqueName, usedBytes,
} from "../server/lib/nodes";
import { seedNode, seedUser } from "./helpers";

test("ensureRootDir creates once and reuses", async () => {
  const u = await seedUser();
  const r1 = await ensureRootDir(env, u.id);
  const r2 = await ensureRootDir(env, u.id);
  expect(r1.id).toBe(r2.id);
  expect(r1.parent_id).toBe("");
});

test("createDir + listChildren + breadcrumb", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env, u.id);
  const photos = await createDir(env, u.id, root.id, "相册");
  const y2024 = await createDir(env, u.id, photos.id, "2024");
  expect((await listChildren(env, u.id, root.id)).map((n) => n.name)).toEqual(["相册"]);
  const crumbs = await breadcrumb(env, u.id, y2024.id);
  expect(crumbs.map((n) => n.name)).toEqual(["相册", "2024"]);
});

test("duplicate name in same dir throws conflict", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env, u.id);
  await createDir(env, u.id, root.id, "a");
  await expect(createDir(env, u.id, root.id, "a")).rejects.toThrow(/名称已存在/);
});

test("uniqueName appends (2)", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env, u.id);
  const f = await seedNode({ owner_id: u.id, parent_id: root.id, name: "a.txt" });
  expect(await uniqueName(env, u.id, root.id, "a.txt")).toBe("a (2).txt");
  await seedNode({ owner_id: u.id, parent_id: root.id, name: "a (2).txt" });
  expect(await uniqueName(env, u.id, root.id, "a.txt")).toBe("a (3).txt");
});

test("moveNode rejects moving dir into its own descendant", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env, u.id);
  const dir = await createDir(env, u.id, root.id, "dir");
  const child = await createDir(env, u.id, dir.id, "child");
  await expect(moveNode(env, u.id, dir.id, child.id, "dir")).rejects.toThrow(/不能移动/);
});

test("quota check uses live size sum", async () => {
  const u = await seedUser({ quota_bytes: 100 });
  const root = await ensureRootDir(env, u.id);
  await seedNode({ owner_id: u.id, parent_id: root.id, name: "f", size: 60 });
  await expect(assertQuota(env, u.id, 50)).rejects.toThrow(/配额/);
  await assertQuota(env, u.id, 40);
  expect(await usedBytes(env, u.id)).toBe(60);
});

test("subtreeIds returns self and descendants", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env, u.id);
  const dir = await createDir(env, u.id, root.id, "d");
  const file = await seedNode({ owner_id: u.id, parent_id: dir.id, name: "f" });
  const ids = await subtreeIds(env, u.id, dir.id);
  expect(ids.sort()).toEqual([dir.id, file.id].sort());
  expect(await getNode(env, u.id, file.id)).not.toBeNull();
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npm test -- nodes`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现**

`server/lib/nodes.ts`：

```ts
import type { Env } from "../env";
import { errors } from "./errors";
import { randomId } from "./crypto";
import type { NodeRow } from "../types";

const now = () => Date.now();

export async function ensureRootDir(db: D1Database, ownerId: string): Promise<NodeRow> {
  const found = await db.prepare("SELECT * FROM nodes WHERE owner_id = ?1 AND parent_id = '' LIMIT 1").bind(ownerId).first<NodeRow>();
  if (found) return found;
  const id = randomId();
  await db.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,'','',1,NULL,NULL,NULL,?3,?3,NULL)"
  ).bind(id, ownerId, now()).run();
  return (await db.prepare("SELECT * FROM nodes WHERE id = ?1").bind(id).first<NodeRow>())!;
}

export async function getNode(db: D1Database, ownerId: string, id: string): Promise<NodeRow | null> {
  return db.prepare("SELECT * FROM nodes WHERE id = ?1 AND owner_id = ?2").bind(id, ownerId).first<NodeRow>();
}

export async function childByName(db: D1Database, ownerId: string, parentId: string, name: string): Promise<NodeRow | null> {
  return db.prepare("SELECT * FROM nodes WHERE owner_id = ?1 AND parent_id = ?2 AND name = ?3").bind(ownerId, parentId, name).first<NodeRow>();
}

export async function createDir(db: D1Database, ownerId: string, parentId: string, name: string): Promise<NodeRow> {
  if (await childByName(db, ownerId, parentId, name)) throw errors.conflict();
  const id = randomId();
  await db.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,1,NULL,NULL,NULL,?5,?5,NULL)"
  ).bind(id, ownerId, parentId, name, now()).run();
  return (await db.prepare("SELECT * FROM nodes WHERE id = ?1").bind(id).first<NodeRow>())!;
}

export async function listChildren(db: D1Database, ownerId: string, parentId: string): Promise<NodeRow[]> {
  const { results } = await db.prepare(
    "SELECT * FROM nodes WHERE owner_id = ?1 AND parent_id = ?2 AND deleted_at IS NULL ORDER BY is_dir DESC, name"
  ).bind(ownerId, parentId).all<NodeRow>();
  return results;
}

export async function breadcrumb(db: D1Database, ownerId: string, dirId: string): Promise<NodeRow[]> {
  const { results } = await db.prepare(`
    WITH RECURSIVE up AS (
      SELECT * FROM nodes WHERE id = ?1 AND owner_id = ?2
      UNION ALL
      SELECT n.* FROM nodes n JOIN up u ON n.id = u.parent_id
    ) SELECT * FROM up WHERE name != ''
  `).bind(dirId, ownerId).all<NodeRow>();
  return results.reverse();
}

export async function uniqueName(db: D1Database, ownerId: string, parentId: string, name: string): Promise<string> {
  if (!(await childByName(db, ownerId, parentId, name))) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!(await childByName(db, ownerId, parentId, candidate))) return candidate;
  }
}

export async function isDescendant(db: D1Database, ownerId: string, ancestorId: string, nodeId: string): Promise<boolean> {
  const { results } = await db.prepare(`
    WITH RECURSIVE sub AS (
      SELECT id FROM nodes WHERE id = ?1 AND owner_id = ?2
      UNION ALL
      SELECT n.id FROM nodes n JOIN sub s ON n.parent_id = s.id
    ) SELECT id FROM sub WHERE id = ?3
  `).bind(ancestorId, ownerId, nodeId).all();
  return results.length > 0;
}

export async function moveNode(db: D1Database, ownerId: string, id: string, newParentId: string, newName: string): Promise<void> {
  const node = await getNode(db, ownerId, id);
  if (!node) throw errors.notFound();
  const parent = newParentId === "" ? await ensureRootDir(db, ownerId) : await getNode(db, ownerId, newParentId);
  if (!parent || !parent.is_dir) throw errors.badRequest("目标目录不存在");
  if (node.is_dir && await isDescendant(db, ownerId, id, newParentId)) throw errors.badRequest("不能移动到自身子目录");
  if (await childByName(db, ownerId, newParentId, newName)) throw errors.conflict();
  await db.prepare("UPDATE nodes SET parent_id = ?1, name = ?2, updated_at = ?3 WHERE id = ?4 AND owner_id = ?5")
    .bind(newParentId, newName, now(), id, ownerId).run();
}

export async function subtreeIds(db: D1Database, ownerId: string, rootId: string): Promise<string[]> {
  const { results } = await db.prepare(`
    WITH RECURSIVE sub AS (
      SELECT id FROM nodes WHERE id = ?1 AND owner_id = ?2
      UNION ALL
      SELECT n.id FROM nodes n JOIN sub s ON n.parent_id = s.id
    ) SELECT id FROM sub
  `).bind(rootId, ownerId).all<{ id: string }>();
  return results.map((r) => r.id);
}

export async function usedBytes(db: D1Database, ownerId: string): Promise<number> {
  const row = await db.prepare("SELECT COALESCE(SUM(size),0) AS s FROM nodes WHERE owner_id = ?1 AND deleted_at IS NULL").bind(ownerId).first<{ s: number }>();
  return row!.s;
}

export async function assertQuota(db: D1Database, ownerId: string, extraBytes: number, defaultQuota: number): Promise<void> {
  const user = await db.prepare("SELECT quota_bytes FROM users WHERE id = ?1").bind(ownerId).first<{ quota_bytes: number }>();
  const used = await usedBytes(db, ownerId);
  if (used + extraBytes > (user?.quota_bytes ?? defaultQuota)) throw errors.quotaExceeded();
}
```

注意：测试里 `createDir` 重复名抛错消息是 `名称已存在`（`errors.conflict()` 默认消息），`assertQuota` 抛 `空间配额不足` — `rejects.toThrow(/配额/)` 匹配。

- [ ] **Step 5: 运行确认通过**

Run: `npm test -- nodes`
Expected: 7 passed。

- [ ] **Step 6: Commit**

```bash
git add server/lib/nodes.ts test/nodes.test.ts test/helpers.ts
git commit -m "feat: node tree operations (root/children/breadcrumb/move/quota/subtree)"
```

> **审查记录（2026-09-27）**：spec review PASS（12 个函数逐项核对，无规格外改动）；quality review 首轮 REQUEST_CHANGES（2 Major）→ commit `78f56be` 修复（createDir/ensureRootDir 捕获 UNIQUE 竞态：映射 409 / 幂等重查；补跨用户隔离测试；childByName 注释说明有意不过滤 deleted_at）→ 复审 APPROVE。最终 commit：`bdc3c37` + `78f56be`，18 tests passed、tsc 零错误。授权偏差：测试传 `env.DB`（计划原文误写 `env`）；`assertQuota` 的 `defaultQuota` 设默认值 10 GiB。

---

### Task 6: session 中间件 + /api/me + 管理端点

**Files:**
- Create: `server/middleware/session.ts`, `server/middleware/admin.ts`, `server/routes/me.ts`, `test/me.test.ts`
- Modify: `test/helpers.ts`, `server/index.ts`

- [ ] **Step 1: 扩展测试辅助（造 session）**

`test/helpers.ts` 追加：

```ts
import { sign } from "hono/jwt";
import { SESSION_COOKIE } from "../server/middleware/session";

export async function sessionHeaders(user: UserRow): Promise<{ cookie: string }> {
  const token = await sign(
    { sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + 3600 },
    "test-session-secret",
  );
  return { cookie: `${SESSION_COOKIE}=${token}` };
}
```

（硬编码 `"test-session-secret"` 与 `vitest.config.ts` 中 `bindings.SESSION_SECRET` 一致。）

- [ ] **Step 2: 写失败测试**

`test/me.test.ts`：

```ts
import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { ensureRootDir } from "../server/lib/nodes";
import { seedUser, sessionHeaders } from "./helpers";

test("GET /api/me returns profile with usage", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env, u.id);
  const res = await SELF.fetch("https://example.com/api/me", { headers: await sessionHeaders(u) });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.name).toBe("tester");
  expect(body.quotaBytes).toBe(u.quota_bytes);
  expect(typeof body.usedBytes).toBe("number");
  expect(root).toBeTruthy();
});

test("GET /api/me without session is 401", async () => {
  const res = await SELF.fetch("https://example.com/api/me");
  expect(res.status).toBe(401);
  expect((await res.json()).error.code).toBe("UNAUTHORIZED");
});

test("PUT /api/me/webdav-password stores pbkdf2 hash", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/me/webdav-password", {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ password: "davpass123" }),
  });
  expect(res.status).toBe(200);
  const row = await env.DB.prepare("SELECT webdav_password_hash FROM users WHERE id = ?1").bind(u.id).first<{ webdav_password_hash: string }>();
  expect(row!.webdav_password_hash!.startsWith("pbkdf2$")).toBe(true);
});

test("admin endpoints enforce role", async () => {
  const member = await seedUser();
  const admin = await seedUser({ role: "admin" });
  const forbidden = await SELF.fetch("https://example.com/api/me/admin/users", { headers: await sessionHeaders(member) });
  expect(forbidden.status).toBe(403);
  const ok = await SELF.fetch("https://example.com/api/me/admin/users", { headers: await sessionHeaders(admin) });
  expect(ok.status).toBe(200);
  const { users } = await ok.json();
  expect(users.length).toBe(2);
  const patched = await SELF.fetch(`https://example.com/api/me/admin/users/${member.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(admin)), "content-type": "application/json" },
    body: JSON.stringify({ quota_bytes: 2048 }),
  });
  expect(patched.status).toBe(200);
  const row = await env.DB.prepare("SELECT quota_bytes FROM users WHERE id = ?1").bind(member.id).first<{ quota_bytes: number }>();
  expect(row!.quota_bytes).toBe(2048);
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npm test -- me`
Expected: FAIL（中间件/路由不存在）。

- [ ] **Step 4: 实现**

`server/middleware/session.ts`：

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
    const payload = await verify(token, c.env.SESSION_SECRET);
    sub = payload.sub as string;
  } catch {
    throw errors.unauthorized();
  }
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(sub).first<UserRow>();
  if (!user) throw errors.unauthorized();
  c.set("user", user);
  await next();
}
```

`server/middleware/admin.ts`：

```ts
import type { Context, Next } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  if (c.get("user").role !== "admin") throw errors.forbidden();
  await next();
}
```

`server/routes/me.ts`：

```ts
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { pbkdf2Hash } from "../lib/crypto";
import { usedBytes } from "../lib/nodes";
import { requireAdmin } from "../middleware/admin";

export const me = new Hono<AppEnv>();

me.get("/", async (c) => {
  const u = c.get("user");
  return c.json({
    id: u.id,
    name: u.name,
    role: u.role,
    quotaBytes: u.quota_bytes,
    usedBytes: await usedBytes(c.env.DB, u.id),
  });
});

me.put("/webdav-password", async (c) => {
  const { password } = await c.req.json<{ password: string }>();
  if (typeof password !== "string" || password.length < 8) throw errors.badRequest("密码至少 8 位");
  // WebDAV 每个请求都要 verify，用较低迭代数控制边缘 CPU 成本（免费版 10ms CPU 限制）
  await c.env.DB.prepare("UPDATE users SET webdav_password_hash = ?1 WHERE id = ?2")
    .bind(await pbkdf2Hash(password, 50_000), c.get("user").id).run();
  return c.json({ ok: true });
});

me.get("/admin/users", requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, role, quota_bytes, created_at FROM users ORDER BY created_at"
  ).all();
  return c.json({ users: results });
});

me.patch("/admin/users/:id", requireAdmin, async (c) => {
  const { quota_bytes, role } = await c.req.json<{ quota_bytes?: number; role?: "admin" | "member" }>();
  if (role && !["admin", "member"].includes(role)) throw errors.badRequest("角色不合法");
  if (quota_bytes !== undefined && (!Number.isFinite(quota_bytes) || quota_bytes < 0)) throw errors.badRequest("配额不合法");
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (quota_bytes !== undefined) { sets.push("quota_bytes = ?"); vals.push(quota_bytes); }
  if (role) { sets.push("role = ?"); vals.push(role); }
  if (!sets.length) throw errors.badRequest("无可更新字段");
  vals.push(c.req.param("id"));
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});
```

`server/index.ts` 路由区修改为：

```ts
app.onError(errorHandler);
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "资源不存在" } }, 404));
app.get("/api/health", (c) => c.json({ ok: true }));
app.use("/api/*", sessionMiddleware);
app.route("/api/me", me);
```

（health 在 session 中间件之前注册，因此无需登录。）

- [ ] **Step 5: 运行确认通过**

Run: `npm test`
Expected: 全部 passed。

- [ ] **Step 6: Commit**

```bash
git add server/middleware server/routes/me.ts server/index.ts test/helpers.ts test/me.test.ts
git commit -m "feat: session auth, /api/me, webdav password, admin users"
```

> **审查记录（2026-09-27）**：spec review PASS；quality review APPROVE_WITH_NITS → commit `f05f469` 修复（session 缺 sub 守卫 401 化、errorHandler 统一映射非法 JSON body → 400 BAD_REQUEST（后续所有 JSON 路由复用）、webdav 哈希加 pbkdf2Verify 真值断言、补伪造 token 401/短密码 400/member PATCH 403 用例、health 免登录注释）。最终 commit：`01a85bf` + `f05f469`，25 tests passed、tsc 零错误。**计划 bug 修正**：`verify(token, secret)` 在 hono 4.13 必须显式传 `"HS256"`，否则抛错——已修复并写入实现。授权偏差：测试传 `env.DB`；test/errors.test.ts 的 404 用例改为携带合法 session 探测（session 中间件挂 /api/* 后未认证路径返回 401 属正确行为）。未采纳（有意）：admin 自降级防护、`?` 与 `?1` 占位符风格统一、/api/me/admin 路径语义。

---

### Task 7: OIDC 登录（PKCE + 首用户 admin + 根目录）

**Files:**
- Create: `server/routes/auth.ts`, `test/auth.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 写失败测试**

`test/auth.test.ts`：

```ts
import { env, fetchMock, SELF } from "cloudflare:test";
import { expect, test } from "vitest";

const ISSUER = "https://auth.msxor.com";

function b64urlJson(obj: object): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function idToken(claims: object): string {
  return `${b64urlJson({ alg: "RS256", typ: "JWT" })}.${b64urlJson(claims)}.sig`;
}

function mockDiscovery() {
  fetchMock.get(`${ISSUER}/.well-known/openid-configuration`, {
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
  });
}

test.beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
test.afterEach(() => fetchMock.deactivate());

test("login redirects to IdP with PKCE and state cookie", async () => {
  mockDiscovery();
  const res = await SELF.fetch("https://example.com/auth/login", { redirect: "manual" });
  expect(res.status).toBe(302);
  const loc = new URL(res.headers.get("location")!);
  expect(loc.origin).toBe(ISSUER);
  expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
  expect(res.headers.get("set-cookie")).toContain("mstor_oidc=");
});

test("callback upserts user (first is admin), creates root, sets session", async () => {
  mockDiscovery();
  fetchMock.post(`${ISSUER}/token`, {
    body: JSON.stringify({ id_token: idToken({ sub: "s1", name: "Alice" }) }),
    headers: { "content-type": "application/json" },
  });
  const state = "st123";
  const res = await SELF.fetch(`https://example.com/auth/callback?code=c1&state=${state}`, {
    redirect: "manual",
    headers: { cookie: `mstor_oidc=${encodeURIComponent(JSON.stringify({ state, verifier: "v" }))}` },
  });
  expect(res.status).toBe(302);
  expect(res.headers.get("set-cookie")).toContain("mstor_session=");
  const user = await env.DB.prepare("SELECT * FROM users WHERE oidc_sub = 's1'").first<{ id: string; role: string }>();
  expect(user!.role).toBe("admin"); // 首个用户
  const root = await env.DB.prepare("SELECT * FROM nodes WHERE owner_id = ?1 AND parent_id = ''").bind(user!.id).first();
  expect(root).toBeTruthy();
});

test("second user defaults to member", async () => {
  await seedUser({ oidc_sub: "existing" }); // 占住“首个用户”
  mockDiscovery();
  fetchMock.post(`${ISSUER}/token`, {
    body: JSON.stringify({ id_token: idToken({ sub: "s2", name: "Bob" }) }),
    headers: { "content-type": "application/json" },
  });
  const res = await SELF.fetch("https://example.com/auth/callback?code=c&state=x", {
    redirect: "manual",
    headers: { cookie: `mstor_oidc=${encodeURIComponent(JSON.stringify({ state: "x", verifier: "v" }))}` },
  });
  expect(res.status).toBe(302);
  const user = await env.DB.prepare("SELECT * FROM users WHERE oidc_sub = 's2'").first<{ role: string }>();
  expect(user!.role).toBe("member");
});

test("callback with wrong state is rejected", async () => {
  mockDiscovery();
  const res = await SELF.fetch("https://example.com/auth/callback?code=c&state=bad", {
    redirect: "manual",
    headers: { cookie: `mstor_oidc=${encodeURIComponent(JSON.stringify({ state: "good", verifier: "v" }))}` },
  });
  expect(res.status).toBe(401);
});

import { seedUser } from "./helpers";
```

（最后一行 import 放文件顶部亦可——保持与既有代码风格一致即可。）

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- auth`
Expected: FAIL（路由不存在）。

- [ ] **Step 3: 实现**

`server/routes/auth.ts`：

```ts
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { randomToken, sha256B64Url } from "../lib/crypto";
import { ensureRootDir } from "../lib/nodes";
import { SESSION_COOKIE } from "../middleware/session";

export const auth = new Hono<AppEnv>();

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
}

async function discover(env: AppEnv["env"]): Promise<Discovery> {
  const res = await fetch(`${env.OIDC_ISSUER}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error("OIDC discovery failed");
  return res.json<Discovery>();
}

auth.get("/login", async (c) => {
  const cfg = await discover(c.env);
  const verifier = randomToken(48);
  const state = randomToken(16);
  const url = new URL(cfg.authorization_endpoint);
  url.searchParams.set("client_id", c.env.OIDC_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${c.env.PUBLIC_URL}/auth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await sha256B64Url(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  setCookie(c, "mstor_oidc", JSON.stringify({ state, verifier }), {
    httpOnly: true, path: "/", maxAge: 600, sameSite: "Lax",
  });
  return c.redirect(url.toString());
});

auth.get("/callback", async (c) => {
  const raw = getCookie(c, "mstor_oidc");
  if (!raw) throw errors.unauthorized();
  const saved = JSON.parse(raw) as { state: string; verifier: string };
  if (c.req.query("state") !== saved.state) throw errors.unauthorized();
  const cfg = await discover(c.env);
  const res = await fetch(cfg.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: c.req.query("code") ?? "",
      redirect_uri: `${c.env.PUBLIC_URL}/auth/callback`,
      client_id: c.env.OIDC_CLIENT_ID,
      client_secret: c.env.OIDC_CLIENT_SECRET,
      code_verifier: saved.verifier,
    }),
  });
  if (!res.ok) throw errors.unauthorized();
  const { id_token } = (await res.json()) as { id_token: string };
  // token 经服务端直连 IdP 换取（TLS + client_secret），claims 可信，无需再验签
  const claims = JSON.parse(atob(id_token.split(".")[1])) as { sub: string; name?: string; preferred_username?: string; role?: string };
  const name = claims.name ?? claims.preferred_username ?? "user";
  const db = c.env.DB;
  let user = await db.prepare("SELECT * FROM users WHERE oidc_sub = ?1").bind(claims.sub).first<{ id: string; role: string }>();
  if (!user) {
    const count = await db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
    const role = count!.n === 0 || claims.role === "admin" ? "admin" : "member";
    const id = randomToken(12);
    await db.prepare(
      "INSERT INTO users (id, oidc_sub, name, role, webdav_password_hash, quota_bytes, created_at) VALUES (?1,?2,?3,?4,NULL,?5,?6)"
    ).bind(id, claims.sub, name, role, Number(c.env.DEFAULT_QUOTA_BYTES), Date.now()).run();
    user = { id, role };
  }
  await ensureRootDir(db, user.id);
  const token = await sign({ sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }, c.env.SESSION_SECRET);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, secure: true, path: "/", maxAge: 7 * 86400, sameSite: "Lax",
  });
  setCookie(c, "mstor_oidc", "", { path: "/", maxAge: 0 });
  return c.redirect("/");
});

auth.get("/logout", (c) => {
  setCookie(c, SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return c.redirect("/");
});
```

注意 `discover(env)` 的参数类型写 `AppEnv["env"]` 不合法——直接改为 `discover(env: Env)`（`import type { Env } from "../env"`），调用处传 `c.env`。

`server/index.ts` 追加挂载（health 之后、session 中间件之前）：

```ts
app.route("/auth", auth);
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部 passed。

- [ ] **Step 5: Commit**

```bash
git add server/routes/auth.ts server/index.ts test/auth.test.ts
git commit -m "feat: OIDC login with PKCE, first-user admin, root dir bootstrap"
```

> **审查记录（2026-09-27）**：spec review PASS；quality review APPROVE_WITH_NITS → commit `1015221` 修复（mstor_oidc cookie 补 secure、callback cookie JSON.parse→401、首用户 INSERT 捕获 UNIQUE 竞态幂等复用、unb64 base64url 解码补直接单测（rem 0/2/3 + 含 -/_）、token 端点 500→401 用例）。最终 commit：`3a4d693` + `1015221`，32 tests passed、tsc 零错误。**计划 bug 修正 3 处**：①id_token payload 是 base64url，`atob` 不接受 -/_，改用 `unb64`（并顺带给 unb64 增加 base64url 归一化，对 pbkdf2 等既有调用零影响）；②`res.json<T>()` 泛型在 workers-types 不可用，用 `as` 断言；③vitest 3.2 无 `test.beforeEach`（需顶层导入）且 cloudflare:test 的 fetchMock 是 undici MockAgent（无 `.post`，用 `.intercept({method,path}).reply()`）。授权偏差：seedUser import 置顶、discover(env: Env)。未采纳（有意）：id_token.split TypeError 路径、discovery 缓存、mock body 断言。

---

### Task 8: 文件路由（列表 / 新建目录 / 重命名移动）

**Files:**
- Create: `server/routes/files.ts`, `server/routes/dirs.ts`, `test/files.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 写失败测试**

`test/files.test.ts`：

```ts
import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, sessionHeaders } from "./helpers";

const json = { "content-type": "application/json" };

async function mkDir(user: Awaited<ReturnType<typeof seedUser>>, parentId: string, name: string) {
  return SELF.fetch("https://example.com/api/dirs", {
    method: "POST",
    headers: { ...(await sessionHeaders(user)), ...json },
    body: JSON.stringify({ parentId, name }),
  });
}

test("mkdir + list with breadcrumb", async () => {
  const u = await seedUser();
  const res = await mkDir(u, "", "相册");
  expect(res.status).toBe(201);
  const dir = await res.json();
  const list = await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) });
  const body = await list.json();
  expect(body.nodes).toHaveLength(1);
  expect(body.nodes[0].name).toBe("相册");
  const sub = await mkDir(u, dir.id, "2024");
  const list2 = await SELF.fetch(`https://example.com/api/files?parentId=${dir.id}`, { headers: await sessionHeaders(u) });
  const body2 = await list2.json();
  expect(body2.nodes.map((n: { name: string }) => n.name)).toEqual(["2024"]);
  expect(body2.breadcrumb.map((n: { name: string }) => n.name)).toEqual(["相册"]);
  expect(sub.status).toBe(201);
});

test("duplicate dir name returns 409", async () => {
  const u = await seedUser();
  await mkDir(u, "", "a");
  const res = await mkDir(u, "", "a");
  expect(res.status).toBe(409);
});

test("rename via PATCH", async () => {
  const u = await seedUser();
  const dir = await (await mkDir(u, "", "old")).json();
  const res = await SELF.fetch(`https://example.com/api/files/${dir.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ name: "new" }),
  });
  expect(res.status).toBe(200);
  const list = await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json();
  expect(list.nodes[0].name).toBe("new");
});

test("isolation: user B cannot touch user A's node", async () => {
  const a = await seedUser({ name: "a" });
  const b = await seedUser({ name: "b" });
  const dir = await (await mkDir(a, "", "secret")).json();
  const res = await SELF.fetch(`https://example.com/api/files/${dir.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(b)), ...json },
    body: JSON.stringify({ name: "hacked" }),
  });
  expect(res.status).toBe(404);
  const listB = await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(b) })).json();
  expect(listB.nodes).toHaveLength(0);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- files`
Expected: FAIL（404 路由不存在）。

- [ ] **Step 3: 实现**

`server/routes/dirs.ts`：

```ts
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { createDir } from "../lib/nodes";

export const dirs = new Hono<AppEnv>();

dirs.post("/", async (c) => {
  const { parentId = "", name } = await c.req.json<{ parentId?: string; name: string }>();
  if (!name?.trim()) throw errors.badRequest("名称不能为空");
  const node = await createDir(c.env.DB, c.get("user").id, parentId, name.trim());
  return c.json(node, 201);
});
```

`server/routes/files.ts`（content 路由在 Task 10 追加）：

```ts
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { breadcrumb, ensureRootDir, getNode, listChildren, moveNode } from "../lib/nodes";

export const files = new Hono<AppEnv>();

files.get("/", async (c) => {
  const user = c.get("user");
  const parentId = c.req.query("parentId") ?? "";
  const root = await ensureRootDir(c.env.DB, user.id);
  if (parentId !== "") {
    const parent = await getNode(c.env.DB, user.id, parentId);
    if (!parent || !parent.is_dir) throw errors.notFound();
  }
  const nodes = await listChildren(c.env.DB, user.id, parentId);
  const crumbs = parentId === "" ? [] : await breadcrumb(c.env.DB, user.id, parentId);
  return c.json({ nodes, breadcrumb: crumbs, rootId: root.id });
});

files.patch("/:id", async (c) => {
  const user = c.get("user");
  const { name, parentId } = await c.req.json<{ name?: string; parentId?: string }>();
  const node = await getNode(c.env.DB, user.id, c.req.param("id"));
  if (!node) throw errors.notFound();
  await moveNode(c.env.DB, user.id, node.id, parentId ?? node.parent_id, name?.trim() || node.name);
  return c.json({ ok: true });
});
```

`server/index.ts` 挂载（session 中间件之后）：

```ts
app.route("/api/files", files);
app.route("/api/dirs", dirs);
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部 passed。

- [ ] **Step 5: Commit**

```bash
git add server/routes/files.ts server/routes/dirs.ts server/index.ts test/files.test.ts
git commit -m "feat: file list/mkdir/rename/move APIs with owner isolation"
```

> **审查记录（2026-09-27）**：spec review PASS；quality review 首轮 REQUEST_CHANGES（2 Major：moveNode 冲突检查未排除自身导致 no-op PATCH 误报 409；POST /api/dirs 不校验 parentId 存在性/归属产生孤儿节点。2 Minor：listChildren 哨兵行过滤下沉 lib 层；validateNodeName 统一名称校验）→ commit `98c0e0c` 修复并补测试（no-op PATCH/纯移动/非法 parentId/非法名）→ 复审 APPROVE。最终 commit：`c6205e5` + `98c0e0c`，39 tests passed、tsc 零错误。**实现期发现并修复 Task 5 遗留 bug**：ensureRootDir 原用 `parent_id=''` 识别根，会误匹配任意顶层目录（根行 (uid,'','') 与顶层 (uid,'','名') 共存），改为 `parent_id='' AND name=''`，两条 SQL（主查询+竞态复用查询）同步修正。规格外改动均经 spec review 验证成立。后续任务注意：listChildren 现已在 lib 层排除哨兵行；新建目录/改名一律走 validateNodeName。

---

### Task 9: 小文件流式上传

**Files:**
- Modify: `server/routes/files.ts`
- Create: `test/upload-small.test.ts`

- [ ] **Step 1: 写失败测试**

`test/upload-small.test.ts`：

```ts
import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, sessionHeaders } from "./helpers";

test("PUT /api/files/upload streams to R2 and creates node", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/files/upload?name=hello.txt", {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-type": "text/plain" },
    body: "hello",
  });
  expect(res.status).toBe(201);
  const { id, name } = await res.json();
  expect(name).toBe("hello.txt");
  const obj = await env.BUCKET.get(`${u.id}/${id}`);
  expect(await obj?.text()).toBe("hello");
  const list = await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json();
  expect(list.nodes[0].size).toBe(5);
  expect(list.nodes[0].mime).toBe("text/plain");
});

test("duplicate name auto-renames to 'a (2).txt'", async () => {
  const u = await seedUser();
  const put = (name: string) => SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT", headers: await sessionHeaders(u), body: "x",
  });
  await put("a.txt");
  const res = await put("a.txt");
  const { name } = await res.json();
  expect(name).toBe("a (2).txt");
});

test("quota exceeded returns 403 QUOTA_EXCEEDED", async () => {
  const u = await seedUser({ quota_bytes: 3 });
  const res = await SELF.fetch("https://example.com/api/files/upload?name=big.txt", {
    method: "PUT", headers: await sessionHeaders(u), body: "12345",
  });
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("QUOTA_EXCEEDED");
});

test("oversize Content-Length rejected before reading body", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/files/upload?name=huge.bin", {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-length": "999999999999" },
  });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- upload-small`
Expected: FAIL（404）。

- [ ] **Step 3: 实现（追加到 files.ts）**

```ts
files.put("/upload", async (c) => {
  const user = c.get("user");
  const name = (c.req.query("name") ?? "").trim();
  const parentId = c.req.query("parentId") ?? "";
  if (!name) throw errors.badRequest("缺少文件名");
  const len = Number(c.req.header("content-length") ?? "0");
  const limit = Number(c.env.SMALL_FILE_LIMIT);
  if (len > limit) throw errors.badRequest(`超过小文件直传上限（${Math.floor(limit / 1048576)}MB），请使用网页端上传大文件`);
  const parent = parentId === "" ? await ensureRootDir(c.env.DB, user.id) : await getNode(c.env.DB, user.id, parentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  const finalName = await uniqueName(c.env.DB, user.id, parentId, name);
  await assertQuota(c.env.DB, user.id, len, Number(c.env.DEFAULT_QUOTA_BYTES));
  const id = randomId();
  const key = `${user.id}/${id}`;
  const mime = c.req.header("content-type") ?? "application/octet-stream";
  const obj = await c.env.BUCKET.put(key, c.req.raw.body, { httpMetadata: { contentType: mime } });
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,0,?5,?6,?7,?8,?8,NULL)"
  ).bind(id, user.id, parentId, finalName, key, obj!.size, mime, now).run();
  return c.json({ id, name: finalName, size: obj!.size }, 201);
});
```

同时把 files.ts 顶部 import 扩为：

```ts
import { breadcrumb, ensureRootDir, getNode, listChildren, moveNode, uniqueName, assertQuota } from "../lib/nodes";
import { randomId } from "../lib/crypto";
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部 passed。

- [ ] **Step 5: Commit**

```bash
git add server/routes/files.ts test/upload-small.test.ts
git commit -m "feat: streaming small-file upload with quota and auto-rename"
```

> **审查记录（2026-09-27）**：spec review PASS；quality review APPROVE_WITH_NITS → commit `e6c0f8e` 修复（uniqueName↔INSERT TOCTOU：UNIQUE 冲突后换名重试一次（R2 key 随机不重传）；len 非有限/负值收紧 400；SMALL_FILE_LIMIT 配置错误显式 500；超限断言补 error.code）。最终 commit：`c1fc009` + `e6c0f8e`，43 tests passed、tsc 零错误。授权偏差：name 走 validateNodeName；body 为 null 抛 400；测试 put 加 async（计划代码语法错误）。**已知取舍（记录给后续任务）**：①quota 门禁按声明 content-length，落库 size=obj.size 实际值；②R2 put 成功后 DB 失败会遗留孤儿对象（无 GC，量级低可接受）；③mime 完全透传客户端——**Task 10 serve 端必须用 Content-Disposition/CSP 兜底防存储型 XSS（text/html 内联）**。

---

### Task 10: 下载 + Range 流式预览

**Files:**
- Create: `server/lib/serve.ts`, `test/download.test.ts`
- Modify: `server/routes/files.ts`

- [ ] **Step 1: 写失败测试**

`test/download.test.ts`：

```ts
import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, sessionHeaders } from "./helpers";

async function upload(u: Awaited<ReturnType<typeof seedUser>>, name: string, body: string) {
  const res = await SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT", headers: await sessionHeaders(u), body,
  });
  return (await res.json()).id as string;
}

test("GET content returns full body inline", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "hello world");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content`, { headers: await sessionHeaders(u) });
  expect(res.status).toBe(200);
  expect(res.headers.get("accept-ranges")).toBe("bytes");
  expect(res.headers.get("content-disposition")).toContain("inline");
  expect(await res.text()).toBe("hello world");
});

test("range bytes=0-4 returns 206 slice", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "hello world");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content`, {
    headers: { ...(await sessionHeaders(u)), range: "bytes=0-4" },
  });
  expect(res.status).toBe(206);
  expect(res.headers.get("content-range")).toBe("bytes 0-4/11");
  expect(await res.text()).toBe("hello");
});

test("suffix range bytes=-5 returns tail", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "hello world");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content`, {
    headers: { ...(await sessionHeaders(u)), range: "bytes=-5" },
  });
  expect(res.status).toBe(206);
  expect(await res.text()).toBe("world");
});

test("out-of-range returns 416", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "hi");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content`, {
    headers: { ...(await sessionHeaders(u)), range: "bytes=99-" },
  });
  expect(res.status).toBe(416);
});

test("dl=1 forces attachment", async () => {
  const u = await seedUser();
  const id = await upload(u, "a.txt", "x");
  const res = await SELF.fetch(`https://example.com/api/files/${id}/content?dl=1`, { headers: await sessionHeaders(u) });
  expect(res.headers.get("content-disposition")).toContain("attachment");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- download`
Expected: FAIL（404）。

- [ ] **Step 3: 实现**

`server/lib/serve.ts`：

```ts
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError, errors } from "./errors";
import type { NodeRow } from "../types";

export async function serveObject(c: Context<AppEnv>, node: NodeRow): Promise<Response> {
  if (!node.r2_key) throw errors.notFound();
  const disposition = c.req.query("dl") === "1" ? "attachment" : "inline";
  const base: Record<string, string> = {
    "content-type": node.mime ?? "application/octet-stream",
    "accept-ranges": "bytes",
    etag: `"${node.id}"`,
    "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(node.name)}`,
  };
  const rangeHeader = c.req.header("range");
  if (!rangeHeader) {
    const obj = await c.env.BUCKET.get(node.r2_key);
    if (!obj) throw errors.notFound();
    return new Response(obj.body, { status: 200, headers: { ...base, "content-length": String(obj.size) } });
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!m || (m[1] === "" && m[2] === "")) throw new HttpError(416, "RANGE_INVALID", "Range 不合法");
  const size = node.size ?? 0;
  let offset: number;
  let length: number | undefined;
  if (m[1] === "") {
    length = Math.min(Number(m[2]), size);
    offset = size - length;
  } else {
    offset = Number(m[1]);
    length = m[2] === "" ? undefined : Number(m[2]) - offset + 1;
  }
  if (offset >= size || (length !== undefined && length <= 0)) throw new HttpError(416, "RANGE_INVALID", "Range 越界");
  const obj = await c.env.BUCKET.get(node.r2_key, { range: { offset, length } });
  if (!obj) throw errors.notFound();
  const end = offset + (obj.size as number) - 1;
  return new Response(obj.body, {
    status: 206,
    headers: { ...base, "content-range": `bytes ${offset}-${end}/${size}`, "content-length": String(obj.size) },
  });
}
```

`server/routes/files.ts` 追加路由（放在 `files.patch("/:id", ...)` 之后）：

```ts
files.get("/:id/content", async (c) => {
  const node = await getNode(c.env.DB, c.get("user").id, c.req.param("id"));
  if (!node || node.is_dir) throw errors.notFound();
  return serveObject(c, node);
});
```

import 增加 `serveObject`。

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部 passed。

- [ ] **Step 5: Commit**

```bash
git add server/lib/serve.ts server/routes/files.ts test/download.test.ts
git commit -m "feat: ranged streaming download shared by preview/share/webdav"
```

> **审查记录（2026-09-27）**：spec review PASS；quality review 首轮 REQUEST_CHANGES（1 Major：range 显式 end 超过 size 未钳制 → 206 content-length 谎报；Minor：不可解析 Range 应落 200、filename RFC 5987 转义、cache-control、range 大小写）→ commit `305d13b` 修复并补 3 用例（end 超界钳制 / 5-2 与 -0 → 416 / 多段 → 200 全量）→ 复审 APPROVE。最终 commit：`31858f4` + `305d13b`，52 tests passed、tsc 零错误。**实现期修正 2 处**：①XSS 兜底（Task 9 记录的强制要求）：nosniff + CSP sandbox 全响应，text/html/svg/xhtml 强制 attachment；②206 的 end/content-length 用计算值 actualLen 推导（不依赖 R2 range get 的 obj.size 语义）。授权偏差：dl=1/html 用例消费流（vitest-pool-workers 悬挂流）、json() as 断言。未做（有意）：416 的 `bytes */size` 头；**HEAD 路由留给 Task 16**（WebDAV 客户端需要）。serveObject 签名 (c, node) 对 Task 14 分享复用已确认够用。

---

### Task 11: 大文件分片直传（presigned multipart）

**Files:**
- Create: `server/lib/r2.ts`, `server/routes/uploads.ts`, `test/uploads.test.ts`
- Modify: `server/index.ts`, `vitest.config.ts`

- [ ] **Step 1: vitest 增加本地 R2_ENDPOINT 覆盖**

`vitest.config.ts` 的 `miniflare.bindings` 增加（测试中 aws4fetch 需要合法 URL；fetchMock 会拦截外部请求）：

```ts
R2_ENDPOINT: "https://test-account.r2.cloudflarestorage.com/mstor",
```

- [ ] **Step 2: 写失败测试**

`test/uploads.test.ts`：

```ts
import { fetchMock, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, sessionHeaders } from "./helpers";

const ENDPOINT = "https://test-account.r2.cloudflarestorage.com/mstor";
const json = { "content-type": "application/json" };

test.beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
test.afterEach(() => fetchMock.deactivate());

test("multipart init → part urls → complete creates node", async () => {
  const u = await seedUser();
  fetchMock.post(`${ENDPOINT}/u-key-1?uploads`, {
    body: `<?xml version="1.0"?><InitiateMultipartUploadResult><UploadId>MPU-1</UploadId></InitiateMultipartUploadResult>`,
  });
  fetchMock.post(`${ENDPOINT}/u-key-1?uploadId=MPU-1`, {
    body: `<?xml version="1.0"?><CompleteMultipartUploadResult><ETag>"e1"</ETag></CompleteMultipartUploadResult>`,
  });
  // init
  const init = await SELF.fetch("https://example.com/api/uploads", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parentId: "", name: "movie.mp4", size: 200 * 1048576, mime: "video/mp4" }),
  });
  expect(init.status).toBe(201);
  const { uploadId, partSize } = await init.json();
  expect(partSize).toBe(16 * 1048576);
  // part urls（签名在本地完成，无需网络）
  const parts = await SELF.fetch(`https://example.com/api/uploads/${uploadId}/part-urls`, {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ partNumbers: [1, 2] }),
  });
  const { urls } = await parts.json();
  expect(urls).toHaveLength(2);
  expect(urls[0]).toContain("partNumber=1");
  expect(urls[0]).toContain("X-Amz-Signature=");
  // complete
  fetchMock.put(new RegExp(`${ENDPOINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/u-key-1\\?partNumber=`), { status: 200 });
  const done = await SELF.fetch(`https://example.com/api/uploads/${uploadId}/complete`, {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parts: [{ partNumber: 1, etag: '"e1"' }, { partNumber: 2, etag: '"e2"' }] }),
  });
  expect(done.status).toBe(201);
  const { nodeId, name } = await done.json();
  expect(name).toBe("movie.mp4");
  const node = await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json();
  expect(node.nodes[0].size).toBe(200 * 1048576);
});

test("small sizes are rejected (use direct upload)", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/uploads", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parentId: "", name: "tiny.txt", size: 100 }),
  });
  expect(res.status).toBe(400);
});

test("foreign uploadId is 404", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/uploads/nope/part-urls", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ partNumbers: [1] }),
  });
  expect(res.status).toBe(404);
});
```

注意：测试中节点 id 由 `randomId()` 生成，`fetchMock` 的 key 应使用通配。改用正则匹配 init/complete：

```ts
const keyRe = (suffix: string) => new RegExp(`${ENDPOINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^/]+${suffix}`);
fetchMock.post(keyRe("\\?uploads"), { body: `...<UploadId>MPU-1</UploadId>...` });
fetchMock.post(keyRe("\\?uploadId=MPU-1"), { body: `...CompleteMultipartUploadResult...` });
```

（实现时以正则版本为准，上面字面量版本仅示意。）

- [ ] **Step 3: 运行确认失败**

Run: `npm test -- uploads`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现**

`server/lib/r2.ts`：

```ts
import { AwsClient } from "aws4fetch";
import type { Env } from "../env";

export function s3Client(env: Env): AwsClient {
  return new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: "s3" });
}

export async function createMultipart(env: Env, key: string): Promise<string> {
  const res = await fetch(await s3Client(env).sign(new Request(`${env.R2_ENDPOINT}/${key}?uploads`, { method: "POST" })));
  if (!res.ok) throw new Error(`CreateMultipartUpload failed: ${await res.text()}`);
  const xml = await res.text();
  const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(xml)?.[1];
  if (!uploadId) throw new Error("no UploadId in response");
  return uploadId;
}

export async function presignPart(env: Env, key: string, uploadId: string, partNumber: number): Promise<string> {
  const signed = await s3Client(env).sign(
    new Request(`${env.R2_ENDPOINT}/${key}?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`, { method: "PUT" }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

export async function completeMultipart(env: Env, key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void> {
  const body = `<CompleteMultipartUpload>${parts
    .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`)
    .join("")}</CompleteMultipartUpload>`;
  const res = await fetch(
    await s3Client(env).sign(new Request(`${env.R2_ENDPOINT}/${key}?uploadId=${encodeURIComponent(uploadId)}`, {
      method: "POST", body, headers: { "content-type": "application/xml" },
    })),
  );
  if (!res.ok) throw new Error(`CompleteMultipartUpload failed: ${await res.text()}`);
}

export async function abortMultipart(env: Env, key: string, uploadId: string): Promise<void> {
  await fetch(await s3Client(env).sign(new Request(`${env.R2_ENDPOINT}/${key}?uploadId=${encodeURIComponent(uploadId)}`, { method: "DELETE" })));
}
```

`server/routes/uploads.ts`：

```ts
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { randomId } from "../lib/crypto";
import { assertQuota, childByName, ensureRootDir, getNode, uniqueName } from "../lib/nodes";
import { abortMultipart, completeMultipart, createMultipart, presignPart } from "../lib/r2";

export const PART_SIZE = 16 * 1048576; // R2 分片最小 5MB（末片除外）

export const uploads = new Hono<AppEnv>();

uploads.post("/", async (c) => {
  const user = c.get("user");
  const { parentId = "", name, size, mime } = await c.req.json<{
    parentId?: string; name: string; size: number; mime?: string;
  }>();
  if (!name?.trim() || !Number.isFinite(size) || size <= 0) throw errors.badRequest("参数不合法");
  const limit = Number(c.env.SMALL_FILE_LIMIT);
  if (size <= limit) throw errors.badRequest("小文件请使用直传接口");
  const parent = parentId === "" ? await ensureRootDir(c.env.DB, user.id) : await getNode(c.env.DB, user.id, parentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  await assertQuota(c.env.DB, user.id, size, Number(c.env.DEFAULT_QUOTA_BYTES));
  const id = randomId();
  const key = `${user.id}/${id}`;
  const r2UploadId = await createMultipart(c.env, key);
  await c.env.DB.prepare(
    "INSERT INTO uploads (id, owner_id, parent_id, name, size, r2_key, r2_upload_id, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'pending',?8)"
  ).bind(id, user.id, parentId, name.trim(), size, key, r2UploadId, Date.now()).run();
  return c.json({ uploadId: id, partSize: PART_SIZE }, 201);
});

uploads.post("/:id/part-urls", async (c) => {
  const user = c.get("user");
  const { partNumbers } = await c.req.json<{ partNumbers: number[] }>();
  if (!Array.isArray(partNumbers) || !partNumbers.length || partNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > 10000))
    throw errors.badRequest("partNumbers 不合法");
  const row = await c.env.DB.prepare("SELECT * FROM uploads WHERE id = ?1 AND owner_id = ?2 AND status = 'pending'")
    .bind(c.req.param("id"), user.id).first<{ r2_key: string; r2_upload_id: string }>();
  if (!row) throw errors.notFound();
  const urls = await Promise.all(partNumbers.map((n) => presignPart(c.env, row.r2_key, row.r2_upload_id, n)));
  return c.json({ urls });
});

uploads.post("/:id/complete", async (c) => {
  const user = c.get("user");
  const { parts } = await c.req.json<{ parts: { partNumber: number; etag: string }[] }>();
  if (!Array.isArray(parts) || !parts.length) throw errors.badRequest("parts 不合法");
  const row = await c.env.DB.prepare("SELECT * FROM uploads WHERE id = ?1 AND owner_id = ?2 AND status = 'pending'")
    .bind(c.req.param("id"), user.id).first<{ id: string; parent_id: string; name: string; size: number; r2_key: string; r2_upload_id: string }>();
  if (!row) throw errors.notFound();
  await completeMultipart(c.env, row.r2_key, row.r2_upload_id, parts);
  const finalName = await uniqueName(c.env.DB, user.id, row.parent_id, row.name);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE uploads SET status = 'done' WHERE id = ?1").bind(row.id),
    c.env.DB.prepare(
      "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,0,?5,?6,?7,?8,?8,NULL)"
    ).bind(row.id, user.id, row.parent_id, finalName, row.r2_key, row.size, "application/octet-stream", now),
  ]);
  return c.json({ nodeId: row.id, name: finalName }, 201);
});

uploads.delete("/:id", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM uploads WHERE id = ?1 AND owner_id = ?2 AND status = 'pending'")
    .bind(c.req.param("id"), user.id).first<{ r2_key: string; r2_upload_id: string }>();
  if (!row) throw errors.notFound();
  await abortMultipart(c.env, row.r2_key, row.r2_upload_id);
  await c.env.DB.prepare("DELETE FROM uploads WHERE id = ?1").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
```

`server/index.ts` 挂载：`app.route("/api/uploads", uploads);`

- [ ] **Step 5: 运行确认通过**

Run: `npm test`
Expected: 全部 passed。

- [ ] **Step 6: Commit**

```bash
git add server/lib/r2.ts server/routes/uploads.ts server/index.ts test/uploads.test.ts vitest.config.ts
git commit -m "feat: presigned multipart upload channel for large files"
```

---

### Task 12: 回收站（软删除 / 恢复 / 彻底删除 / 定时清理）

**Files:**
- Create: `server/routes/trash.ts`, `test/trash.test.ts`
- Modify: `server/routes/files.ts`, `server/index.ts`

- [ ] **Step 1: 写失败测试**

`test/trash.test.ts`：

```ts
import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { purgeExpiredTrash } from "../server/routes/trash";
import { ensureRootDir } from "../server/lib/nodes";
import { seedUser, sessionHeaders } from "./helpers";

async function upload(u: Awaited<ReturnType<typeof seedUser>>, name: string, body: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT", headers: await sessionHeaders(u), body,
  });
  return (await res.json()).id as string;
}

test("delete → trash list → restore → permanent", async () => {
  const u = await seedUser();
  const fid = await upload(u, "f.txt", "data");
  expect((await SELF.fetch(`https://example.com/api/files/${fid}`, {
    method: "DELETE", headers: await sessionHeaders(u),
  })).status).toBe(200);

  const list = await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json();
  expect(list.nodes).toHaveLength(0);
  const t = await (await SELF.fetch("https://example.com/api/trash", { headers: await sessionHeaders(u) })).json();
  expect(t.nodes.map((n: { id: string }) => n.id)).toContain(fid);

  expect((await SELF.fetch(`https://example.com/api/trash/${fid}/restore`, {
    method: "POST", headers: await sessionHeaders(u),
  })).status).toBe(200);
  const list2 = await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json();
  expect(list2.nodes.map((n: { id: string }) => n.id)).toContain(fid);

  expect((await SELF.fetch(`https://example.com/api/trash/${fid}`, {
    method: "DELETE", headers: await sessionHeaders(u),
  })).status).toBe(200);
  expect(await env.BUCKET.get(`${u.id}/${fid}`)).toBeNull();
  expect(await env.DB.prepare("SELECT * FROM nodes WHERE id = ?1").bind(fid).first()).toBeNull();
});

test("deleting a directory trashes the whole subtree", async () => {
  const u = await seedUser();
  const dir = await (await SELF.fetch("https://example.com/api/dirs", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ parentId: "", name: "d" }),
  })).json();
  const fid = await upload(u, "f.txt", "x");
  // 把文件挂到目录下（通过 PATCH 移动）
  await SELF.fetch(`https://example.com/api/files/${fid}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ parentId: dir.id }),
  });
  await SELF.fetch(`https://example.com/api/files/${dir.id}`, { method: "DELETE", headers: await sessionHeaders(u) });
  const t = await (await SELF.fetch("https://example.com/api/trash", { headers: await sessionHeaders(u) })).json();
  expect(t.nodes.map((n: { id: string }) => n.id).sort()).toEqual([dir.id, fid].sort());
});

test("root cannot be trashed", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env, u.id);
  const res = await SELF.fetch(`https://example.com/api/files/${root.id}`, {
    method: "DELETE", headers: await sessionHeaders(u),
  });
  expect(res.status).toBe(400);
});

test("purgeExpiredTrash removes entries older than retention", async () => {
  const u = await seedUser();
  const fid = await upload(u, "old.txt", "old");
  await env.DB.prepare("UPDATE nodes SET deleted_at = ?1 WHERE id = ?2")
    .bind(Date.now() - 40 * 86400000, fid).run();
  await purgeExpiredTrash(env);
  expect(await env.DB.prepare("SELECT * FROM nodes WHERE id = ?1").bind(fid).first()).toBeNull();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- trash`
Expected: FAIL。

- [ ] **Step 3: 实现**

`server/routes/trash.ts`：

```ts
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { errors } from "../lib/errors";
import { getNode, subtreeIds, uniqueName } from "../lib/nodes";

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function softDeleteNode(db: D1Database, ownerId: string, id: string): Promise<void> {
  const node = await getNode(db, ownerId, id);
  if (!node || node.deleted_at) throw errors.notFound();
  if (node.parent_id === "") throw errors.badRequest("不能删除根目录");
  const ids = await subtreeIds(db, ownerId, id);
  const ph = ids.map((_, i) => `?${i + 3}`).join(",");
  await db.prepare(`UPDATE nodes SET deleted_at = ?1 WHERE owner_id = ?2 AND deleted_at IS NULL AND id IN (${ph})`)
    .bind(Date.now(), ownerId, ...ids).run();
}

export async function permanentDeleteNode(env: Env, ownerId: string, id: string): Promise<void> {
  const node = await getNode(env.DB, ownerId, id);
  if (!node) throw errors.notFound();
  const ids = await subtreeIds(env.DB, ownerId, id);
  for (const part of chunk(ids, 50)) {
    const ph = part.map((_, i) => `?${i + 1}`).join(",");
    const files = await env.DB.prepare(`SELECT r2_key FROM nodes WHERE id IN (${ph}) AND r2_key IS NOT NULL`)
      .bind(...part).all<{ r2_key: string }>();
    await Promise.all(files.results.map((f) => env.BUCKET.delete(f.r2_key)));
    await env.DB.prepare(`DELETE FROM shares WHERE node_id IN (${ph})`).bind(...part).run();
    await env.DB.prepare(`DELETE FROM nodes WHERE id IN (${ph})`).bind(...part).run();
  }
}

export async function purgeExpiredTrash(env: Env): Promise<void> {
  const cutoff = Date.now() - Number(env.TRASH_RETENTION_DAYS) * 86400000;
  const { results } = await env.DB.prepare(
    "SELECT id, owner_id FROM nodes WHERE deleted_at IS NOT NULL AND deleted_at < ?1"
  ).bind(cutoff).all<{ id: string; owner_id: string }>();
  for (const r of results) {
    await permanentDeleteNode(env, r.owner_id, r.id).catch(() => {});
  }
}

export const trash = new Hono<AppEnv>();

trash.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM nodes WHERE owner_id = ?1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500"
  ).bind(c.get("user").id).all();
  return c.json({ nodes: results });
});

trash.post("/:id/restore", async (c) => {
  const user = c.get("user");
  const node = await getNode(c.env.DB, user.id, c.req.param("id"));
  if (!node || !node.deleted_at) throw errors.notFound();
  const parent = node.parent_id === "" ? null : await getNode(c.env.DB, user.id, node.parent_id);
  const targetParent = parent && !parent.deleted_at ? node.parent_id : "";
  const name = await uniqueName(c.env.DB, user.id, targetParent, node.name);
  const ids = await subtreeIds(c.env.DB, user.id, node.id);
  const ph = ids.map((_, i) => `?${i + 3}`).join(",");
  await c.env.DB.prepare(`UPDATE nodes SET deleted_at = NULL WHERE owner_id = ?1 AND id IN (${ph})`)
    .bind(user.id, ...ids).run();
  await c.env.DB.prepare("UPDATE nodes SET parent_id = ?1, name = ?2 WHERE id = ?3")
    .bind(targetParent, name, node.id).run();
  return c.json({ ok: true });
});

trash.delete("/:id", async (c) => {
  await permanentDeleteNode(c.env, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
```

`server/routes/files.ts` 追加：

```ts
files.delete("/:id", async (c) => {
  await softDeleteNode(c.env.DB, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
```

`server/index.ts`：默认导出改为（import `purgeExpiredTrash` from `./routes/trash`）：

```ts
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(purgeExpiredTrash(env));
  },
} satisfies ExportedHandler<Env>;
```

挂载：`app.route("/api/trash", trash);`

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部 passed。

- [ ] **Step 5: Commit**

```bash
git add server/routes/trash.ts server/routes/files.ts server/index.ts test/trash.test.ts
git commit -m "feat: trash (soft delete/restore/purge) with daily cron cleanup"
```

---

### Task 13: FTS5 搜索

**Files:**
- Create: `server/routes/search.ts`, `test/search.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 写失败测试**

`test/search.test.ts`：

```ts
import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedNode, seedUser, sessionHeaders } from "./helpers";

test("search by name prefix with owner isolation and trash exclusion", async () => {
  const u = await seedUser();
  const other = await seedUser();
  await seedNode({ owner_id: u.id, name: "财报2024.pdf", size: 1 });
  await seedNode({ owner_id: u.id, name: "财报草稿.pdf", deleted_at: Date.now() });
  await seedNode({ owner_id: other.id, name: "财报2024.pdf", size: 1 });

  const res = await SELF.fetch("https://example.com/api/search?q=财报", { headers: await sessionHeaders(u) });
  expect(res.status).toBe(200);
  const { nodes } = await res.json();
  expect(nodes).toHaveLength(1);
  expect(nodes[0].name).toBe("财报2024.pdf");
});

test("empty query returns empty list", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/search?q=", { headers: await sessionHeaders(u) });
  expect((await res.json()).nodes).toHaveLength(0);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- search`
Expected: FAIL。

- [ ] **Step 3: 实现**

`server/routes/search.ts`：

```ts
import { Hono } from "hono";
import type { AppEnv } from "../env";

export const search = new Hono<AppEnv>();

search.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const safe = q.replace(/["'()*%_\\]/g, " ").trim();
  if (!safe) return c.json({ nodes: [] });
  // trigram 分词要求查询 ≥3 码点且为整段子串；短查询退化为 LIKE
  if ([...safe].length >= 3) {
    const { results } = await c.env.DB.prepare(
      `SELECT n.* FROM nodes_fts f JOIN nodes n ON n.id = f.node_id
       WHERE nodes_fts MATCH ?1 AND n.owner_id = ?2 AND n.deleted_at IS NULL
       ORDER BY n.updated_at DESC LIMIT 50`
    ).bind(`"${safe}"`, c.get("user").id).all();
    return c.json({ nodes: results });
  }
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM nodes WHERE owner_id = ?1 AND deleted_at IS NULL AND name LIKE ?2
     ORDER BY updated_at DESC LIMIT 50`
  ).bind(c.get("user").id, `%${safe}%`).all();
  return c.json({ nodes: results });
});
```

`server/index.ts` 挂载：`app.route("/api/search", search);`

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部 passed。

- [ ] **Step 5: Commit**

```bash
git add server/routes/search.ts server/index.ts test/search.test.ts
git commit -m "feat: FTS5 filename search with owner scoping"
```

---

### Task 14: 分享（管理 + 公开访问 + 提取码 + 计数）

**Files:**
- Create: `server/routes/shares.ts`, `test/shares.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 写失败测试**

`test/shares.test.ts`：

```ts
import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { randomId } from "../server/lib/crypto";
import { seedNode, seedUser, sessionHeaders } from "./helpers";

const json = { "content-type": "application/json" };

async function upload(u: Awaited<ReturnType<typeof seedUser>>, name: string, body: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT", headers: await sessionHeaders(u), body,
  });
  return (await res.json()).id as string;
}

test("create share → public meta → raw download increments counter", async () => {
  const u = await seedUser();
  const fid = await upload(u, "share.txt", "shared-data");
  const created = await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: fid }),
  });
  expect(created.status).toBe(201);
  const { token } = await created.json();

  const meta = await SELF.fetch(`https://example.com/api/s/${token}`);
  expect(meta.status).toBe(200);
  expect((await meta.json()).name).toBe("share.txt");

  const raw = await SELF.fetch(`https://example.com/api/s/${token}/raw/${fid}`);
  expect(raw.status).toBe(200);
  expect(await raw.text()).toBe("shared-data");
  const row = await env.DB.prepare("SELECT downloads FROM shares WHERE token = ?1").bind(token).first<{ downloads: number }>();
  expect(row!.downloads).toBe(1);
});

test("password-protected share requires x-share-password", async () => {
  const u = await seedUser();
  const fid = await upload(u, "p.txt", "x");
  const { token } = await (await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: fid, password: "1234" }),
  })).json();
  expect((await SELF.fetch(`https://example.com/api/s/${token}`)).status).toBe(401);
  const ok = await SELF.fetch(`https://example.com/api/s/${token}`, { headers: { "x-share-password": "1234" } });
  expect(ok.status).toBe(200);
});

test("expired share returns 410; revoked returns 404", async () => {
  const u = await seedUser();
  const fid = await upload(u, "e.txt", "x");
  const { token } = await (await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: fid }),
  })).json();
  const shareId = ((await env.DB.prepare("SELECT id FROM shares WHERE token = ?1").bind(token).first()) as { id: string }).id;
  await env.DB.prepare("UPDATE shares SET expires_at = ?1 WHERE id = ?2").bind(Date.now() - 1000, shareId).run();
  expect((await SELF.fetch(`https://example.com/api/s/${token}`)).status).toBe(410);
  await env.DB.prepare("UPDATE shares SET expires_at = NULL, revoked_at = ?1 WHERE id = ?2").bind(Date.now(), shareId).run();
  expect((await SELF.fetch(`https://example.com/api/s/${token}`)).status).toBe(404);
});

test("raw outside subtree is 404", async () => {
  const u = await seedUser();
  const fid = await upload(u, "in.txt", "x");
  const outsider = await seedNode({ owner_id: u.id, name: "out.txt", size: 1, r2_key: `${u.id}/${randomId()}` });
  const { token } = await (await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: fid }),
  })).json();
  expect((await SELF.fetch(`https://example.com/api/s/${token}/raw/${outsider.id}`)).status).toBe(404);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- shares`
Expected: FAIL。

- [ ] **Step 3: 实现**

`server/routes/shares.ts`：

```ts
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError, errors } from "../lib/errors";
import { pbkdf2Hash, pbkdf2Verify, randomToken } from "../lib/crypto";
import { getNode, isDescendant, listChildren } from "../lib/nodes";
import { serveObject } from "../lib/serve";
import type { NodeRow, ShareRow } from "../types";

export const shares = new Hono<AppEnv>();

shares.post("/", async (c) => {
  const user = c.get("user");
  const { nodeId, expiresInDays, password } = await c.req.json<{
    nodeId: string; expiresInDays?: number; password?: string;
  }>();
  const node = await getNode(c.env.DB, user.id, nodeId);
  if (!node) throw errors.notFound();
  const token = randomToken(16);
  const passwordHash = password ? await pbkdf2Hash(password) : null;
  const expiresAt = expiresInDays ? Date.now() + expiresInDays * 86400000 : null;
  await c.env.DB.prepare(
    "INSERT INTO shares (id, node_id, token, password_hash, expires_at, downloads, created_at, revoked_at) VALUES (?1,?2,?3,?4,?5,0,?6,NULL)"
  ).bind(randomToken(12), nodeId, token, passwordHash, expiresAt, Date.now()).run();
  return c.json({ token, url: `${c.env.PUBLIC_URL}/s/${token}` }, 201);
});

shares.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.*, n.name AS node_name, n.is_dir AS node_is_dir, n.size AS node_size
     FROM shares s JOIN nodes n ON n.id = s.node_id
     WHERE n.owner_id = ?1 AND s.revoked_at IS NULL ORDER BY s.created_at DESC`
  ).bind(c.get("user").id).all();
  return c.json({ shares: results });
});

shares.delete("/:id", async (c) => {
  const res = await c.env.DB.prepare(
    `UPDATE shares SET revoked_at = ?1
     WHERE id = ?2 AND node_id IN (SELECT id FROM nodes WHERE owner_id = ?3)`
  ).bind(Date.now(), c.req.param("id"), c.get("user").id).run();
  if (!res.meta.changes) throw errors.notFound();
  return c.json({ ok: true });
});

export const publicShares = new Hono<AppEnv>();

async function loadShare(c: Context<AppEnv>, token: string): Promise<{ share: ShareRow; node: NodeRow }> {
  const share = await c.env.DB.prepare("SELECT * FROM shares WHERE token = ?1").bind(token).first<ShareRow>();
  if (!share || share.revoked_at) throw errors.notFound();
  if (share.expires_at && Date.now() > share.expires_at) throw new HttpError(410, "SHARE_EXPIRED", "分享已过期");
  const node = await c.env.DB.prepare("SELECT * FROM nodes WHERE id = ?1 AND deleted_at IS NULL")
    .bind(share.node_id).first<NodeRow>();
  if (!node) throw errors.notFound();
  if (share.password_hash) {
    const pw = c.req.header("x-share-password");
    if (!pw || !(await pbkdf2Verify(pw, share.password_hash))) {
      throw new HttpError(401, "SHARE_PASSWORD", "需要提取码");
    }
  }
  return { share, node };
}

publicShares.get("/:token", async (c) => {
  const { share, node } = await loadShare(c, c.req.param("token"));
  const base = {
    name: node.name,
    isDir: !!node.is_dir,
    size: node.size,
    mime: node.mime,
    hasPassword: !!share.password_hash,
    expiresAt: share.expires_at,
  };
  if (!node.is_dir) return c.json(base);
  const children = await listChildren(c.env.DB, node.owner_id, node.id);
  return c.json({
    ...base,
    children: children.map((x) => ({ id: x.id, name: x.name, isDir: !!x.is_dir, size: x.size, mime: x.mime })),
  });
});

publicShares.get("/:token/raw/:fileId", async (c) => {
  const { share, node } = await loadShare(c, c.req.param("token"));
  const fileId = c.req.param("fileId");
  const target = await getNode(c.env.DB, node.owner_id, fileId);
  if (!target || target.is_dir || !(await isDescendant(c.env.DB, node.owner_id, node.id, fileId))) {
    throw errors.notFound();
  }
  await c.env.DB.prepare("UPDATE shares SET downloads = downloads + 1 WHERE id = ?1").bind(share.id).run();
  return serveObject(c, target);
});
```

`server/index.ts` 挂载（顺序重要：`publicShares` 必须在 session 中间件之前）：

```ts
app.route("/api/s", publicShares);      // 无需登录
app.use("/api/*", sessionMiddleware);   // 之后的所有 /api 需要登录
// ...
app.route("/api/shares", shares);
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部 passed。

- [ ] **Step 5: Commit**

```bash
git add server/routes/shares.ts server/index.ts test/shares.test.ts
git commit -m "feat: share links with expiry/password/revoke and download counter"
```

---

### Task 15: WebDAV A（Basic Auth + PROPFIND + GET/PUT + OPTIONS）

**Files:**
- Create: `server/lib/davxml.ts`, `server/middleware/davauth.ts`, `server/routes/dav.ts`, `test/dav.test.ts`
- Modify: `test/helpers.ts`, `server/index.ts`

- [ ] **Step 1: 测试辅助（WebDAV Basic 头）**

`test/helpers.ts` 追加：

```ts
import { pbkdf2Hash } from "../server/lib/crypto";

export async function davHeaders(user: UserRow, password = "davpass123"): Promise<Record<string, string>> {
  await env.DB.prepare("UPDATE users SET webdav_password_hash = ?1 WHERE id = ?2")
    .bind(await pbkdf2Hash(password), user.id).run();
  return { authorization: `Basic ${btoa(`${user.name}:${password}`)}` };
}
```

- [ ] **Step 2: 写失败测试**

`test/dav.test.ts`：

```ts
import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, davHeaders, sessionHeaders } from "./helpers";

async function upload(u: Awaited<ReturnType<typeof seedUser>>, name: string, body: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT", headers: await sessionHeaders(u), body,
  });
  return (await res.json()).id as string;
}

test("OPTIONS advertises DAV class 1,2", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/dav/", {
    method: "OPTIONS", headers: await davHeaders(u),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("dav")).toContain("1, 2");
});

test("dav requires valid basic auth", async () => {
  const res = await SELF.fetch("https://example.com/dav/", { method: "OPTIONS" });
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")).toContain("Basic");
});

test("PROPFIND depth 1 lists root children", async () => {
  const u = await seedUser();
  await upload(u, "dav.txt", "hello");
  const res = await SELF.fetch("https://example.com/dav/", {
    method: "PROPFIND",
    headers: { ...(await davHeaders(u)), depth: "1" },
  });
  expect(res.status).toBe(207);
  const xml = await res.text();
  expect(xml).toContain("<D:multistatus");
  expect(xml).toContain("dav.txt");
  expect(xml).toContain("<D:getcontentlength>5</D:getcontentlength>");
});

test("GET file with range via dav", async () => {
  const u = await seedUser();
  await upload(u, "dav.txt", "hello");
  const res = await SELF.fetch("https://example.com/dav/dav.txt", {
    headers: { ...(await davHeaders(u)), range: "bytes=1-3" },
  });
  expect(res.status).toBe(206);
  expect(await res.text()).toBe("ell");
});

test("PUT creates and replaces file", async () => {
  const u = await seedUser();
  const h = await davHeaders(u);
  expect((await SELF.fetch("https://example.com/dav/new.txt", { method: "PUT", headers: h, body: "v1" })).status).toBe(201);
  expect((await SELF.fetch("https://example.com/dav/new.txt", { method: "PUT", headers: h, body: "v2-longer" })).status).toBe(204);
  const list = await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json();
  expect(list.nodes[0].name).toBe("new.txt");
  expect(list.nodes[0].size).toBe(9);
});

test("PUT into missing directory returns 409", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/dav/no-dir/x.txt", {
    method: "PUT", headers: await davHeaders(u), body: "x",
  });
  expect(res.status).toBe(409);
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npm test -- dav`
Expected: FAIL。

- [ ] **Step 4: 实现**

`server/lib/davxml.ts`：

```ts
export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[m]!);
}

export const LOCK_TOKEN = "opaquelocktoken:mstor-fake-lock";

export function propResponse(href: string, node: {
  is_dir: 0 | 1; name: string; size: number | null; mime: string | null; updated_at: number;
}): string {
  const isDir = !!node.is_dir;
  const rtype = isDir ? "<D:resourcetype><D:collection/></D:resourcetype>" : "<D:resourcetype/>";
  const fileProps = isDir
    ? ""
    : `<D:getcontentlength>${node.size ?? 0}</D:getcontentlength><D:getcontenttype>${escapeXml(node.mime ?? "application/octet-stream")}</D:getcontenttype>`;
  return (
    `<D:response><D:href>${escapeXml(href)}</D:href><D:propstat><D:prop>${rtype}${fileProps}` +
    `<D:displayname>${escapeXml(node.name)}</D:displayname>` +
    `<D:getlastmodified>${new Date(node.updated_at).toUTCString()}</D:getlastmodified>` +
    `<D:creationdate>${new Date(node.updated_at).toISOString()}</D:creationdate>` +
    `<D:supportedlock><D:entry><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:entry></D:supportedlock>` +
    `<D:lockdiscovery><D:activelock><D:locktoken><D:href>${LOCK_TOKEN}</D:href></D:locktoken></D:activelock></D:lockdiscovery>` +
    `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`
  );
}

export function multistatus(responses: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${responses.join("")}</D:multistatus>`;
}
```

`server/middleware/davauth.ts`：

```ts
import type { Context, Next } from "hono";
import type { AppEnv } from "../env";
import { pbkdf2Verify, unb64 } from "../lib/crypto";
import type { UserRow } from "../types";

export async function davAuth(c: Context<AppEnv>, next: Next) {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();
  let name: string, password: string;
  try {
    // atob 是 Latin-1 解码，会破坏非 ASCII 密码；统一按 UTF-8 解码 Basic 凭据
    [name, password] = new TextDecoder().decode(unb64(header.slice(6))).split(":");
  } catch {
    return unauthorized();
  }
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE name = ?1").bind(name).first<UserRow>();
  if (!user?.webdav_password_hash || !(await pbkdf2Verify(password, user.webdav_password_hash))) {
    return unauthorized();
  }
  c.set("user", user);
  await next();
}

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="MStor"' } });
}
```

`server/routes/dav.ts`（Part A）：

```ts
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { childByName, ensureRootDir, listChildren } from "../lib/nodes";
import { serveObject } from "../lib/serve";
import { multistatus, propResponse } from "../lib/davxml";
import { davAuth } from "../middleware/davauth";
import type { NodeRow } from "../types";

export const dav = new Hono<AppEnv>();

dav.use("*", davAuth);

interface Resolved {
  node: NodeRow | null;   // 最深命中节点（可能为 null = 不存在）
  parent: NodeRow;        // 已存在的最深父目录
  segments: string[];
  walked: number;         // 实际命中层数：walked === segments.length 表示目标存在
  path: string;           // 已命中部分："." 表示根
}

async function resolvePath(c: Context<AppEnv>): Promise<Resolved> {
  const user = c.get("user");
  const rel = decodeURIComponent(new URL(c.req.url).pathname.slice("/dav".length));
  const segments = rel.split("/").filter(Boolean);
  let parent = await ensureRootDir(c.env.DB, user.id);
  let node: NodeRow | null = parent;
  let walked = 0;
  for (const seg of segments) {
    if (!node || !node.is_dir) break;
    parent = node;
    node = await childByName(c.env.DB, user.id, node.id, seg);
    if (node) walked++;
  }
  const path = walked === 0 ? "." : "/" + segments.slice(0, walked).join("/");
  return { node, parent, segments, walked, path };
}

const xmlHeaders = { "content-type": 'application/xml; charset="utf-8"' };

async function propfind(c: Context<AppEnv>): Promise<Response> {
  const r = await resolvePath(c);
  if (!r.node) return new Response(null, { status: 404 });
  const depth = (c.req.header("depth") ?? "1").trim();
  const selfHref = r.path === "." ? "/dav/" : `/dav${r.path}`;
  const responses = [propResponse(selfHref, r.node)];
  if (depth === "1" && r.node.is_dir) {
    const base = r.path === "." ? "" : r.path;
    for (const child of await listChildren(c.env.DB, c.get("user").id, r.node.id)) {
      responses.push(propResponse(`/dav${base}/${child.name}`, child));
    }
  }
  return new Response(multistatus(responses), { status: 207, headers: xmlHeaders });
}

async function davGet(c: Context<AppEnv>): Promise<Response> {
  const r = await resolvePath(c);
  if (!r.node || r.node.is_dir) return new Response(null, { status: 404 });
  return serveObject(c, r.node);
}

async function davPut(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const r = await resolvePath(c);
  if (!r.segments.length || !r.parent.is_dir) return new Response(null, { status: 409 });
  if (r.node?.is_dir) return new Response(null, { status: 409 });
  const name = r.segments[r.segments.length - 1];
  const mime = c.req.header("content-type") ?? "application/octet-stream";
  if (r.node) {
    // 覆盖已有文件
    const obj = await c.env.BUCKET.put(r.node.r2_key!, c.req.raw.body, { httpMetadata: { contentType: mime } });
    await c.env.DB.prepare("UPDATE nodes SET size = ?1, updated_at = ?2 WHERE id = ?3")
      .bind(obj!.size, Date.now(), r.node.id).run();
    return new Response(null, { status: 204 });
  }
  if (r.walked !== r.segments.length - 1) return new Response(null, { status: 409 }); // 父目录路径不存在
  const id = crypto.randomUUID();
  const key = `${user.id}/${id}`;
  const obj = await c.env.BUCKET.put(key, c.req.raw.body, { httpMetadata: { contentType: mime } });
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,0,?5,?6,?7,?8,?8,NULL)"
  ).bind(id, user.id, r.parent.id, name, key, obj!.size, mime, now).run();
  return new Response(null, { status: 201 });
}

dav.on(["OPTIONS", "GET", "HEAD", "PUT", "PROPFIND"], "*", async (c) => {
  switch (c.req.method) {
    case "OPTIONS":
      return new Response(null, {
        status: 200,
        headers: {
          DAV: "1, 2",
          "MS-Author-Via": "DAV",
          Allow: "OPTIONS, GET, HEAD, PUT, PROPFIND, MKCOL, DELETE, MOVE, COPY, LOCK, UNLOCK",
        },
      });
    case "PROPFIND": return propfind(c);
    case "GET":
    case "HEAD": return davGet(c);
    case "PUT": return davPut(c);
    default: return new Response(null, { status: 405 });
  }
});
```

`server/index.ts` 挂载（session 之外）：`app.route("/dav", dav);`

- [ ] **Step 5: 运行确认通过**

Run: `npm test`
Expected: 全部 passed。

- [ ] **Step 6: Commit**

```bash
git add server/lib/davxml.ts server/middleware/davauth.ts server/routes/dav.ts server/index.ts test/helpers.ts test/dav.test.ts
git commit -m "feat: webdav gateway part A (auth/propfind/get/put)"
```

---

### Task 16: WebDAV B（MKCOL / MOVE / COPY / DELETE / LOCK）

**Files:**
- Modify: `server/routes/dav.ts`, `test/dav.test.ts`

- [ ] **Step 1: 追加失败测试（test/dav.test.ts）**

```ts
async function mkcol(u: Awaited<ReturnType<typeof seedUser>>, path: string) {
  return SELF.fetch(`https://example.com/dav${path}`, { method: "MKCOL", headers: await davHeaders(u) });
}

test("MKCOL creates directory visible via API", async () => {
  const u = await seedUser();
  expect((await mkcol(u, "/photos")).status).toBe(201);
  const list = await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json();
  expect(list.nodes.map((n: { name: string }) => n.name)).toContain("photos");
  expect((await mkcol(u, "/photos")).status).toBe(405);
});

test("MOVE renames file", async () => {
  const u = await seedUser();
  await upload(u, "old.txt", "x");
  const res = await SELF.fetch("https://example.com/dav/old.txt", {
    method: "MOVE",
    headers: { ...(await davHeaders(u)), destination: "https://example.com/dav/new.txt" },
  });
  expect(res.status).toBe(201);
  const list = await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json();
  expect(list.nodes[0].name).toBe("new.txt");
});

test("COPY duplicates file (independent R2 object)", async () => {
  const u = await seedUser();
  await upload(u, "src.txt", "copy-me");
  const res = await SELF.fetch("https://example.com/dav/src.txt", {
    method: "COPY",
    headers: { ...(await davHeaders(u)), destination: "https://example.com/dav/dst.txt" },
  });
  expect(res.status).toBe(201);
  const list = await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json();
  expect(list.nodes.map((n: { name: string }) => n.name).sort()).toEqual(["dst.txt", "src.txt"]);
  const ids = list.nodes as { id: string }[];
  expect(ids[0].id).not.toBe(ids[1].id);
});

test("DELETE via dav permanently removes", async () => {
  const u = await seedUser();
  const fid = await upload(u, "gone.txt", "bye");
  expect((await SELF.fetch("https://example.com/dav/gone.txt", {
    method: "DELETE", headers: await davHeaders(u),
  })).status).toBe(204);
  expect(await env.DB.prepare("SELECT * FROM nodes WHERE id = ?1").bind(fid).first()).toBeNull();
});

test("LOCK returns token", async () => {
  const u = await seedUser();
  await upload(u, "l.txt", "x");
  const res = await SELF.fetch("https://example.com/dav/l.txt", {
    method: "LOCK", headers: await davHeaders(u),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("lock-token")).toContain("opaquelocktoken:");
  expect(await res.text()).toContain("lockdiscovery");
});
```

（`env` 需加入该文件已有 import：`import { env, SELF } from "cloudflare:test";`）

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- dav`
Expected: 新增用例 FAIL（405）。

- [ ] **Step 3: 实现（dav.ts 修改/追加）**

import 增加：

```ts
import { createDir, listChildren, moveNode, childByName, ensureRootDir } from "../lib/nodes";
import { permanentDeleteNode } from "./trash";
import { randomId } from "../lib/crypto";
```

追加工具函数与处理器：

```ts
function destinationSegments(c: Context<AppEnv>): string[] | null {
  const dest = c.req.header("destination");
  if (!dest) return null;
  try {
    const u = new URL(dest, c.req.url);
    if (!u.pathname.startsWith("/dav")) return null;
    const segs = decodeURIComponent(u.pathname.slice("/dav".length)).split("/").filter(Boolean);
    return segs.length ? segs : null;
  } catch {
    return null;
  }
}

async function walkSegments(c: Context<AppEnv>, segments: string[]): Promise<NodeRow | null> {
  const user = c.get("user");
  let node: NodeRow | null = await ensureRootDir(c.env.DB, user.id);
  for (const seg of segments) {
    if (!node || !node.is_dir) return null;
    node = await childByName(c.env.DB, user.id, node.id, seg);
  }
  return node;
}

async function davMkcol(c: Context<AppEnv>): Promise<Response> {
  const r = await resolvePath(c);
  if (r.node) return new Response(null, { status: 405 });
  if (r.segments.length === 0 || r.walked !== r.segments.length - 1 || !r.parent.is_dir)
    return new Response(null, { status: 409 });
  await createDir(c.env.DB, c.get("user").id, r.parent.id, r.segments[r.segments.length - 1]);
  return new Response(null, { status: 201 });
}

async function davDelete(c: Context<AppEnv>): Promise<Response> {
  const r = await resolvePath(c);
  if (!r.node || r.path === ".") return new Response(null, { status: 404 });
  await permanentDeleteNode(c.env, c.get("user").id, r.node.id);
  return new Response(null, { status: 204 });
}

async function davMove(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const r = await resolvePath(c);
  if (!r.node || r.path === ".") return new Response(null, { status: 404 });
  const destSegs = destinationSegments(c);
  if (!destSegs) return new Response(null, { status: 400 });
  const destName = destSegs[destSegs.length - 1];
  const destParent = destSegs.length > 1 ? await walkSegments(c, destSegs.slice(0, -1)) : await ensureRootDir(c.env.DB, user.id);
  if (!destParent || !destParent.is_dir) return new Response(null, { status: 409 });
  const existing = await childByName(c.env.DB, user.id, destParent.id, destName);
  if (existing && c.req.header("overwrite")?.toLowerCase() === "f") return new Response(null, { status: 412 });
  if (existing) await permanentDeleteNode(c.env, user.id, existing.id);
  await moveNode(c.env.DB, user.id, r.node.id, destParent.id, destName);
  return new Response(null, { status: existing ? 204 : 201 });
}

async function copyInto(c: Context<AppEnv>, src: NodeRow, destParentId: string, name: string): Promise<void> {
  const user = c.get("user");
  if (src.is_dir) {
    const dir = await createDir(c.env.DB, user.id, destParentId, name);
    for (const child of await listChildren(c.env.DB, user.id, src.id)) {
      await copyInto(c, child, dir.id, child.name);
    }
  } else {
    const id = randomId();
    const key = `${user.id}/${id}`;
    await c.env.BUCKET.copy(src.r2_key!, key);
    const now = Date.now();
    await c.env.DB.prepare(
      "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,0,?5,?6,?7,?8,?8,NULL)"
    ).bind(id, user.id, destParentId, name, key, src.size, src.mime, now).run();
  }
}

async function davCopy(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const r = await resolvePath(c);
  if (!r.node) return new Response(null, { status: 404 });
  const destSegs = destinationSegments(c);
  if (!destSegs) return new Response(null, { status: 400 });
  const destName = destSegs[destSegs.length - 1];
  const destParent = destSegs.length > 1 ? await walkSegments(c, destSegs.slice(0, -1)) : await ensureRootDir(c.env.DB, user.id);
  if (!destParent || !destParent.is_dir) return new Response(null, { status: 409 });
  const existing = await childByName(c.env.DB, user.id, destParent.id, destName);
  if (existing && c.req.header("overwrite")?.toLowerCase() === "f") return new Response(null, { status: 412 });
  if (existing) await permanentDeleteNode(c.env, user.id, existing.id);
  await copyInto(c, r.node, destParent.id, destName);
  return new Response(null, { status: existing ? 204 : 201 });
}

function davLock(): Response {
  const token = `opaquelocktoken:mstor-${randomId()}`;
  const body =
    `<?xml version="1.0" encoding="utf-8"?><D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock>` +
    `<D:locktoken><D:href>${token}</D:href></D:locktoken></D:activelock></D:lockdiscovery></D:prop>`;
  return new Response(body, { status: 200, headers: { ...xmlHeaders, "lock-token": `<${token}>` } });
}
```

`dav.on` 改为覆盖全部方法并接线：

```ts
dav.on(["OPTIONS", "GET", "HEAD", "PUT", "PROPFIND", "MKCOL", "DELETE", "MOVE", "COPY", "LOCK", "UNLOCK"], "*", async (c) => {
  switch (c.req.method) {
    case "OPTIONS":
      return new Response(null, {
        status: 200,
        headers: {
          DAV: "1, 2",
          "MS-Author-Via": "DAV",
          Allow: "OPTIONS, GET, HEAD, PUT, PROPFIND, MKCOL, DELETE, MOVE, COPY, LOCK, UNLOCK",
        },
      });
    case "PROPFIND": return propfind(c);
    case "GET":
    case "HEAD": return davGet(c);
    case "PUT": return davPut(c);
    case "MKCOL": return davMkcol(c);
    case "DELETE": return davDelete(c);
    case "MOVE": return davMove(c);
    case "COPY": return davCopy(c);
    case "LOCK": return davLock();
    case "UNLOCK": return new Response(null, { status: 204 });
    default: return new Response(null, { status: 405 });
  }
});
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部 passed。

- [ ] **Step 5: Commit**

```bash
git add server/routes/dav.ts test/dav.test.ts
git commit -m "feat: webdav part B (mkcol/move/copy/delete/lock)"
```

---

### Task 17: 收尾（CORS 配置、最终接线检查、部署清单）

**Files:**
- Create: `cors.json`
- Modify: `server/index.ts`（最终形态核对）

- [ ] **Step 1: 写 cors.json（前端直传 R2 需要）**

`cors.json`：

```json
[
  {
    "AllowedOrigins": ["https://stor.msxor.com", "http://localhost:5173"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

应用到 R2（二选一）：
- `npx wrangler r2 bucket cors set mstor --file cors.json`
- 若 wrangler 版本不支持该子命令：dashboard → R2 → mstor → Settings → CORS 粘贴此 JSON

- [ ] **Step 2: 核对 server/index.ts 最终形态**

```ts
import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { errorHandler } from "./lib/errors";
import { sessionMiddleware } from "./middleware/session";
import { auth } from "./routes/auth";
import { publicShares, shares } from "./routes/shares";
import { me } from "./routes/me";
import { files } from "./routes/files";
import { dirs } from "./routes/dirs";
import { uploads } from "./routes/uploads";
import { trash, purgeExpiredTrash } from "./routes/trash";
import { search } from "./routes/search";
import { dav } from "./routes/dav";

const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "资源不存在" } }, 404));
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/auth", auth);
app.route("/api/s", publicShares);        // 公开分享：无需登录
app.use("/api/*", sessionMiddleware);     // 其余 API：需要登录
app.route("/api/me", me);
app.route("/api/files", files);
app.route("/api/dirs", dirs);
app.route("/api/uploads", uploads);
app.route("/api/trash", trash);
app.route("/api/search", search);
app.route("/api/shares", shares);
app.route("/dav", dav);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(purgeExpiredTrash(env));
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 3: 全量测试**

Run: `npm test`
Expected: 全部 passed，无跳过。

- [ ] **Step 4: 本地冒烟（手动）**

Run: `npm run dev`，浏览器打开 `http://localhost:8787/auth/login`（需 auth.msxor.com 配置了 localhost 回调，或临时把 `PUBLIC_URL` var 改为 `http://localhost:8787` 试跑）。

- [ ] **Step 5: 部署清单（人工操作，逐条执行）**

```bash
# 1. Secrets
npx wrangler secret put OIDC_CLIENT_SECRET     # 从 auth.msxor.com 客户端配置获取
npx wrangler secret put SESSION_SECRET         # openssl rand -hex 32 生成
npx wrangler secret put R2_ACCESS_KEY_ID       # R2 API Token（Object Read & Write，限定 mstor bucket）
npx wrangler secret put R2_SECRET_ACCESS_KEY

# 2. wrangler.jsonc 核对
#    - d1 database_id 已回填
#    - R2_ENDPOINT 的 <ACCOUNT_ID> 已替换为真实账户 ID
#    - OIDC_CLIENT_ID 与 auth.msxor.com 注册的 client 一致
#    - auth.msxor.com 侧 redirect_uri 注册为 https://stor.msxor.com/auth/callback

# 3. 数据库迁移（远程）
npx wrangler d1 migrations apply mstor --remote

# 4. R2 CORS
npx wrangler r2 bucket cors set mstor --file cors.json

# 5. 部署
npx wrangler deploy

# 6. DNS：stor.msxor.com CNAME 到 workers 域名（dashboard Workers → Domains 添加即自动）
```

- [ ] **Step 6: Commit**

```bash
git add cors.json server/index.ts
git commit -m "chore: cors config, final route wiring, deploy checklist"
```

---

## 计划自审记录

**Spec 覆盖对照**（spec §7 → 任务）：
- §7.1 上传双通道 → Task 9（≤60MB 流式）+ Task 11（分片直传）
- §7.2 下载/预览（Range、disposition）→ Task 10（`serveObject` 被 Task 14/15 复用）
- §7.3 分享（有效期/提取码/撤销/计数/文件夹）→ Task 14
- §7.4 回收站（子树软删/恢复/彻底删/30 天 cron）→ Task 12
- §7.5 FTS5 搜索 → Task 13
- §7.6 WebDAV（全部方法 + LOCK 假成功）→ Task 15/16
- §6 认证（OIDC PKCE/首用户 admin/根目录）→ Task 7；session → Task 6；WebDAV Basic → Task 15
- §5 数据模型 → Task 2；`DEFAULT_QUOTA_BYTES` → Task 1 vars + Task 5 `assertQuota`
- §8 错误 envelope → Task 4；配额 403 → Task 9
- 测试策略 → 每个 Task 均含 vitest-pool-workers 集成测试

**类型一致性**：`ensureRootDir/getNode/createDir/listChildren/breadcrumb/uniqueName/moveNode/subtreeIds/usedBytes/assertQuota/isDescendant` 全部在 Task 5 定义并全计划一致；`serveObject(c, node)`（Task 10）被 Task 14/15 复用；`permanentDeleteNode(env, ownerId, id)`（Task 12）被 Task 16 复用；`Resolved{node,parent,segments,path}`（Task 15）在 Task 16 复用。

**已知取舍**（有意为之，非遗漏）：oidc id_token 只解码不验签（服务端直连换取，见 Task 7 注释）；WebDAV LOCK 为假成功（Windows 必需，无真实锁语义）；分享计数按 raw 请求数（含 Range 分段请求）。


