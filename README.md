# MStor · 私有家庭云盘

基于 **Cloudflare Workers + R2 + D1** 的私有云盘：**Cloudflare Access（Zero Trust）认证**、文件树管理、断点续传/秒传、分享链接、回收站，前端为 React 19 + TanStack Query + Tailwind 4。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 运行时 | Cloudflare Workers（`nodejs_compat`） |
| 存储 | R2（对象）+ D1（元数据） |
| 后端 | Hono + TypeScript（strict） |
| 前端 | React 19、TanStack Query/Virtual、react-router、Tailwind 4、Vite |
| 测试 | Vitest（服务端 `@cloudflare/vitest-pool-workers`，客户端 jsdom） |
| 质量 | ESLint 9（flat）、Prettier、双 `tsc`、GitHub Actions |

## 目录结构

```
server/         Workers 后端（routes / middleware / lib）
client/         前端（Vite root，源码在 client/src）
migrations/     D1 增量迁移（0001-…）
sql/schema.sql  全量 DDL（新环境一次性建库）
sql/seed.sql    初始数据（INSERT OR IGNORE，幂等）
test/           服务端测试
```

## 本地开发

```bash
npm install
npm run dev          # wrangler dev，后端 http://127.0.0.1:8787
npm run dev:client   # vite，前端开发服务器（已配置 /api 代理）
```

## 认证（Cloudflare Access）

登录入口由 **Cloudflare Access（Zero Trust）** 在边缘接管：Worker 对每个 `/api/*` 请求验签 Access 注入的 `Cf-Access-Jwt-Assertion`（jose，`iss` = team domain、`aud` = 应用 AUD、RS256），无状态、fail closed。

### Zero Trust 侧配置（上线前置）

1. **Worker 级 Access**：Dashboard → Worker → Access 标签 → Protect this Worker（All traffic），策略 Allow + 家庭成员邮箱白名单——自动覆盖该 Worker 全部入口（含 workers.dev），并记录应用 AUD 到 `wrangler.jsonc` 的 `ACCESS_AUD`。
2. **公开分享 Bypass 应用**：Self-hosted，域名 `stor.msxor.com`，路径 `/s`、`/s/*`、`/api/s/*`、`/api/health`，Action = Bypass（Include Everyone）——分享链接匿名可达（hostname 型应用优先级高于 Worker 级保护）。
3. 建议开启应用 Cookie 设置中的 **Binding cookie**。

### 存量账号迁移（email 锚点）

- `users.access_sub`（原 `oidc_sub`，0015 更名）+ 新增 `users.email` 唯一索引与 `access_bound_at` 确认时间。
- 迁移窗口 `ACCESS_PROVISION=off`：未知 Access 身份返回 403 并打日志 `access_unknown_identity`（含 sub/email），管理员在设置页为存量账号回填「绑定邮箱」后，该用户下次登录自动锚定原账号（`access_sub` 自愈回填）。
- 全部绑定后把 `ACCESS_PROVISION` 改为 `on` 再部署：此后新 Access 身份自动建号，**首个完成登录者成为 admin**（Allow 邮箱白名单天然防止外人抢注）。

### 登出、应急与回滚

- 登出跳 `/cdn-cgi/access/logout`（跨应用全局登出，属 Access 官方行为）。
- 应急解锁：关闭 Worker 级 Access（秒级）或直接改 `wrangler.jsonc` vars 重新部署。
- 完整回退顺序：先把 Worker 级 Access 改为 Bypass/关闭 → `npx wrangler rollback` 回到含 OIDC 的部署 → 恢复 `OIDC_ISSUER`、`OIDC_CLIENT_ID` 与 `OIDC_CLIENT_SECRET`/`SESSION_SECRET` → 执行 0015 反向 SQL（见下） → 如已有账号完成 Access 绑定，使用迁移前 D1 备份恢复最稳。
- 0015 反向 SQL 仅恢复列名/索引；SQLite 不能便捷删除已新增的 `email` 列，保留为 NULL 不影响旧代码：

```sql
ALTER TABLE users RENAME COLUMN access_sub TO oidc_sub;
DROP INDEX IF EXISTS idx_users_email;
ALTER TABLE users DROP COLUMN access_bound_at;
```

## 环境变量与密钥

非敏感配置（`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、`AUTH_MODE`、`ACCESS_PROVISION`、`PUBLIC_URL`、`R2_ENDPOINT`、配额等）位于 `wrangler.jsonc` 的 `vars`。
敏感值通过 `wrangler secret put` 写入，不入库、不进 Git：

```bash
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

上线切换成功并确认无需回退后，删除旧 OIDC 会话密钥：

```bash
npx wrangler secret delete SESSION_SECRET
npx wrangler secret delete OIDC_CLIENT_SECRET
```

本地开发身份经 `.dev.vars` 提供（`AUTH_MODE=dev`，已被 `.gitignore` 忽略）。

## 数据库

新环境一次性建库：

```bash
npx wrangler d1 execute mstor --remote --file=sql/schema.sql
npx wrangler d1 execute mstor --remote --file=sql/seed.sql
```

既有环境用增量迁移（`migrations/` 与 `sql/schema.sql` 保持等价，勿混用）：

```bash
npx wrangler d1 migrations list mstor --remote
npx wrangler d1 migrations apply mstor --remote
```

## 测试与校验

```bash
npm test            # 服务端 + 客户端全部用例
npm run test:ci     # 测试 + 构建（CI 用）
npm run test:coverage
npm run check       # 双 tsc + ESLint
npm run lint
npm run format
npm run build && npm run visual:check   # headless Chrome 关键页截图 + 横向溢出检查（需本机 Chrome/Edge）
npm run visual:check -- --baseline     # 追加像素基线对比（默认差异阈值 1.5%，可用 VISUAL_DIFF_MAX 覆盖）
npm run visual:check -- --update-baseline  # 有意改版后更新 docs/design/v7 基线
```

## 部署

```bash
npm run deploy      # predeploy 先校验 Access 配置，再 vite build && wrangler deploy
```

部署前须先通过 `npm run check` 与 `npm run test:ci`；迁移需先于部署应用到远程 D1。

## 说明

- 前端依赖与后端统一在根 `package.json` 管理（单包仓库），无独立 `client/package.json`。
- 单文件直传上限、分片大小等由服务端下发的限制驱动，前端不硬编码。

### 本机构建/测试的常见阻塞

- `esbuild ... Access is denied` / `spawn EPERM`：把临时目录指到工作区内再跑，例如 PowerShell：
  `New-Item -ItemType Directory -Force .tmp-build; $env:TEMP="$PWD\.tmp-build"; $env:TMP=$env:TEMP; npm run build`
- 服务端 vitest 依赖 Miniflare 的 workerd，受限环境可能起不来（`ERR_RUNTIME_FAILURE`）。
  此时改用 `npm run test:server:local`：用 node:sqlite 垫片直接驱动真实 Worker，
  覆盖隔离/邀请/存储/分享/检索/批量等 25 项断言（不含组件与纯函数单测）。


### workerd 启动失败（npm 11 的脚本门禁）

npm 11 起对依赖的 install 脚本有 allowScripts 门禁，未批准时 `workerd` 包不会执行 postinstall，
`node_modules/workerd/bin/workerd.exe` 缺失，Miniflare 会直接 `std::terminate()` / `ERR_RUNTIME_FAILURE`。
`npm run dev` 与 `npm run test:server` 前会自动执行 `scripts/ensure-workerd.mjs` 补齐二进制；
也可手动 `npm approve-scripts --allow-scripts-pending` 后 `npm rebuild workerd`。

