# MStor · 私有家庭云盘

MStor 是部署在 Cloudflare 上的私有家庭云盘。项目采用 **Workers + D1 + R2 + Cloudflare Access**，前端为 React 19 + Vite + Tailwind 4，提供文件树、上传下载、断点续传、秒传、分享、回收站、搜索、标签、收藏、通知、注册审核与审计能力。

当前产品边界是 **每个 approved 用户一个私有个人空间**。团队共享空间、成员邀请、通用 SaaS 计费不是当前能力；相关历史决策见 `docs/decisions/DECISIONS.md`。

## 快速开始

```bash
npm install
npm run dev          # Cloudflare Workers API，http://127.0.0.1:8787
npm run dev:client   # Vite 前端开发服务器，按终端输出访问
```

本地身份由 `.dev.vars` 提供；该文件被 Git 忽略。没有 `.dev.vars` 时不要猜测密钥，先联系维护者。

## 常用命令

| 目的 | 命令 |
|---|---|
| 全量静态检查 | `npm run check` |
| 服务端测试 | `npm run test:server` |
| Windows/受限环境服务端集成测试 | `npm run test:server:local` |
| 客户端测试 | `npm run test:client` |
| 全部测试 | `npm test` |
| CI 口径 | `npm run test:ci` |
| 构建 | `npm run build` |
| Schema 不变量 | `npm run check:schema` |
| 迁移链等价性 | `npm run check:migrations` |
| 视觉烟测 | `npm run build && npm run visual:check` |
| 视觉基线对比 | `npm run visual:check -- --baseline` |

## 仓库结构

```text
AGENTS.md             AI / 协作工程规范
README.md             运行与交付入口
DESIGN.md             UI 设计契约
docs/spec/            当前有效规范
docs/decisions/       架构与产品决策记录
docs/design/v11/       视觉测试基线
server/               Workers API
client/               React 前端
migrations/           D1 增量迁移
sql/schema.sql        新环境全量 DDL
sql/seed.sql          幂等初始配置
test/                 Workers 服务端测试
scripts/              构建、校验、测试脚本
```

## 规范索引

| 文档 | 内容 |
|---|---|
| [AGENTS.md](./AGENTS.md) | 协作流程、工程门禁、生产红线 |
| [产品规范](./docs/spec/PRODUCT.md) | 用户、场景、功能边界、验收口径 |
| [架构规范](./docs/spec/ARCHITECTURE.md) | 系统拓扑、模块边界、数据流 |
| [数据规范](./docs/spec/DATA.md) | 表职责、不变量、迁移策略 |
| [API 规范](./docs/spec/API.md) | 端点、认证、错误与兼容规则 |
| [安全规范](./docs/spec/SECURITY.md) | Access、租户隔离、分享、审计、密钥 |
| [测试规范](./docs/spec/TESTING.md) | 测试金字塔、必测场景、质量门禁 |
| [运维规范](./docs/spec/OPERATIONS.md) | 配置、部署、备份、回滚、监控 |
| [决策记录](./docs/decisions/DECISIONS.md) | 已拍板决策与替代方案 |

## 数据库

新环境一次性建库：

```bash
npx wrangler d1 execute mstor --remote --file=sql/schema.sql
npx wrangler d1 execute mstor --remote --file=sql/seed.sql
```

既有环境：

```bash
npx wrangler d1 migrations list mstor --remote
npx wrangler d1 migrations apply mstor --remote
```

禁止混用“全量 schema + 增量 migration”的方式升级既有环境。

## 部署

```bash
npm run check
npm run test:ci
npx wrangler d1 migrations list mstor --remote
npx wrangler d1 migrations apply mstor --remote
npm run deploy
```

部署细节、回滚和生产红线见 `docs/spec/OPERATIONS.md`。生产写操作必须先获得明确授权。

## 本机问题

- Windows 下 Miniflare/workerd 可能启动失败，先重跑 `npm run test:server`；仍失败则使用 `npm run test:server:local`，并以 CI 的 Ubuntu 结果为准。
- `esbuild Access is denied` 或 `spawn EPERM` 时，将 `TEMP`/`TMP` 指到工作区内 `.tmp-build` 后重试。
- 视觉检查需要本机 Chrome 或 Edge。
