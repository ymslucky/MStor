# AGENTS.md — MStor AI 协作与上下文规范

本文件是 AI 代理进入仓库后的第一上下文。目标是让代理用最少、最新、可验证的信息做出正确变更，而不是依赖历史记忆或猜测。

## 1. 系统身份与不可变边界

MStor 是部署在 Cloudflare 上的私有家庭云盘：

- 运行时：Cloudflare Workers + Hono；
- 数据：D1 元数据 + R2 对象；
- 准入：Cloudflare Access；
- 前端：React 19 + Vite + Tailwind 4；
- 产品：每个 approved 用户一个私有 workspace；
- 非目标：通用 SaaS、团队共享空间、匿名上传、WebDAV / FTP / NAS 协议。

任何任务开始前，先记住三条安全不变量：

1. 用户数据必须以 `workspace_id` 隔离；
2. 跨租户资源返回 404，不泄露存在性；
3. R2 对象物理删除必须经过 `orphan_objects` 延迟复查。

## 2. 上下文获取协议

不要默认读取全部文档和全部源码。按任务类型加载最小上下文。

### 2.1 必读基线

每次任务开始必须执行：

```bash
git status --short --branch
```

并阅读：

1. 本文件；
2. 与任务相关的 SPEC；
3. 相关实现文件；
4. 相关测试文件。

当文档与代码冲突时，不能直接相信任意一方：

1. 用代码和测试验证当前行为；
2. 判断是文档过期还是代码缺陷；
3. 在同一变更中修正一方；
4. 在交付说明中说明冲突来源和处理结果。

### 2.2 任务路由表

| 任务类型 | 先读 | 再读 | 必看实现 / 测试 |
|---|---|---|---|
| Bug 修复 | `docs/spec/API.md`、`docs/spec/SECURITY.md` | 相关产品旅程 | 对应 `server/routes/**`、`server/data/**`、`test/**` |
| 文件 / 目录 / 回收站 | `docs/spec/DATA.md`、`docs/spec/ARCHITECTURE.md` | `docs/spec/PRODUCT.md` | `server/lib/nodes.ts`、`server/data/trash.ts`、`test/path.test.ts`、`test/trash*.test.ts` |
| 上传 / 下载 | `docs/spec/API.md`、`docs/spec/DATA.md` | `docs/spec/TESTING.md` | `server/routes/uploads.ts`、`server/routes/files.ts`、`client/src/api/uploads.ts`、`test/uploads.test.ts` |
| 分享 / 匿名访问 | `docs/spec/SECURITY.md`、`docs/spec/API.md` | `docs/spec/PRODUCT.md` | `server/routes/shares.ts`、`server/data/shares.ts`、`test/shares.test.ts` |
| 权限 / act-as | `docs/spec/SECURITY.md` | `docs/spec/API.md` | `server/middleware/access.ts`、`server/routes/me.ts`、`test/auth.test.ts`、`test/me.test.ts` |
| schema / migration | `docs/spec/DATA.md` | `docs/spec/OPERATIONS.md` | `sql/schema.sql`、`migrations/**`、`scripts/validate-schema.mjs` |
| 前端交互 / UI | `DESIGN.md` | `docs/spec/PRODUCT.md`、`docs/spec/TESTING.md` | `client/src/pages/**`、`client/src/components/**`、对应 `.test.tsx` |
| 发布 / 运维 | `docs/spec/OPERATIONS.md` | `docs/spec/SECURITY.md` | `.github/workflows/ci.yml`、`wrangler.jsonc` |
| 依赖升级 | `docs/spec/SECURITY.md` | `docs/spec/TESTING.md` | `package.json`、`package-lock.json`、CI |
| 文档 / SPEC | `docs/README.md` | 相关 SPEC | 相关代码与测试 |

### 2.3 信息检索规则

- 优先用精确路径和关键词检索，不做无边界全仓库扫描。
- 不把 `node_modules`、`client/dist`、Git 对象、生产日志当作上下文。
- 不因某个历史提交曾这样做，就假设当前规则仍允许这样做。
- 不把聊天记忆当作仓库事实；最终只认当前工作树。
- 过程性分析不写入仓库，转化为测试、SPEC 不变量或 PR 说明。
- 输出诊断时引用文件和行为证据，不粘贴大段无关日志。

## 3. 任务执行模式

### 3.1 Bug 修复

执行顺序：

1. 复现或用测试固化失败行为；
2. 定位根因，区分症状与根因；
3. 写最小修复；
4. 补回归测试；
5. 运行受影响门禁；
6. 说明未覆盖风险。

禁止：

- 只改期望让测试通过；
- 只处理当前输入，不处理边界；
- 在未验证权限的情况下修改查询条件。

### 3.2 功能开发

执行顺序：

1. 判断是否改变产品边界；若改变，先补 ADR；
2. 更新产品 / API / 数据 / 安全契约；
3. 设计 schema 与兼容策略；
4. 实现服务端再实现客户端；
5. 补测试；
6. 运行门禁。

若需求缺少关键决策，先列出少量具体问题；无法等待时使用保守假设，并在交付说明中标明。

### 3.3 重构

重构必须满足：

- 行为不变；
- 公共 API 兼容；
- 测试不减少；
- 每个提交可独立回滚；
- 不混合重构、功能和行为修复。

优先顺序：

1. 提取纯函数；
2. 收敛 SQL 到 data 模块；
3. 拆 route 职责；
4. 拆前端 hook 与展示组件；
5. 清理死代码。

### 3.4 文档 / SPEC 更新

文档变更必须：

- 描述当前系统，不描述愿望；
- 有唯一事实来源，不复制同一规则到多处；
- 将验收标准写成可执行命令或测试；
- 删除被替代内容，而不是追加“新旧都存在”的长文。

### 3.5 依赖升级

必须说明：

- 升级原因；
- 版本差异；
- 安全收益；
- breaking changes；
- 验证结果。

生产运行时依赖升级后必须运行：

```bash
npm audit --omit=dev --audit-level=moderate
npm run check
npm run test:client
npm run test:server:local
npm run build
```

## 4. 代码上下文规则

### 4.1 服务端

- `server/routes/**` 负责 HTTP 协议、参数解析和响应，不新增内联 SQL。
- 业务用例优先进入 `server/data/**` 或可测试纯函数。
- 权限、配额、审计在业务写操作前或同一事务边界内处理。
- 高风险动作能使用 `auditStmt` 进入同一 D1 batch 时，不得拆成独立写。
- D1 查询必须显式绑定 `workspace_id`。
- 错误语义遵循 `docs/spec/API.md`，不要随意改变状态码。

### 4.2 前端

- 页面组装、数据请求、交互策略、展示组件分层。
- 权限和配额真相在服务端，前端只做体验优化。
- TanStack Query key 必须包含身份与数据维度，避免 act-as 缓存串号。
- UI 色值、层级、字号、间距以 `DESIGN.md` 与 `client/src/index.css` 为准。
- 不引入临时视觉硬编码。

### 4.3 数据库

- 既有环境只使用 migration，不手工执行 DDL。
- `sql/schema.sql` 必须与 migration 最终态等价。
- migration 合入后不可修改；修正必须新增 migration。
- 破坏性变更采用 expand → migrate → contract。
- 禁止 D1 行删除后直接物理删除 R2 对象。

## 5. 验证矩阵

最低验证：

```bash
npm run check
```

按影响面追加：

| 变更 | 必跑 |
|---|---|
| 服务端 | `npm run test:server`；Windows runtime 失败时至少跑 `npm run test:server:local` |
| 客户端 | `npm run test:client` |
| schema / migration | `npm run check:schema && npm run check:migrations` |
| 构建 / 依赖 | `npm run build` |
| 运行时依赖 | `npm audit --omit=dev --audit-level=moderate` |
| UI 视觉 | `npm run build && npm run visual:check -- --baseline` |

若本机无法执行某门禁，不得假装通过；必须写明“未验证”和原因，并说明 CI 是否覆盖。

## 6. 生产安全与工具边界

未获得用户明确指令时，禁止执行任何生产写操作，包括：

- `wrangler deploy`
- `wrangler rollback`
- `wrangler d1 migrations apply --remote`
- 可写 的 `wrangler d1 execute --remote`
- `wrangler secret put/delete`
- 删除或覆盖 R2 对象
- 修改 Cloudflare Access / DNS / WAF

生产只读查询必须：

1. 先说明目的；
2. 只查最小字段；
3. 不输出邮箱、文件名、token 等敏感值；
4. 不把查询结果写入仓库。

密钥只能存在于 Cloudflare secrets 或本地 `.dev.vars`，不得进入 Git、日志、测试快照、文档或聊天输出。

## 7. 上下文输出契约

每次交付必须简洁回答四个问题：

1. **改了什么**：按模块概括；
2. **为什么安全**：关键不变量和兼容策略；
3. **验证了什么**：列出命令和结果；
4. **没验证什么**：明确剩余风险。

引用文件时使用仓库内路径。不要输出无关命令日志、完整测试列表或大段代码。

## 8. 提交规则

- 提交信息使用中文 Conventional Commits。
- 一个提交只做一件事。
- 提交前运行：
  - `git diff --check`
  - 与影响面对应的验证命令
- 不提交：
  - 构建产物；
  - 本地缓存；
  - 生产数据；
  - 日期式过程报告；
  - 未使用的代码和依赖。
- 提交后确认 `git status` 干净，再推送或交付。
