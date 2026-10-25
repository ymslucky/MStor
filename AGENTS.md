# AGENTS.md — Codex / AI 协作规范

本文件约束所有在 MStor 仓库工作的 AI 代理。人类协作者也应遵循相同工程口径。

## 1. 项目事实与优先级

MStor 是部署在 Cloudflare 上的私有家庭云盘，不是通用 SaaS、团队网盘或匿名公开网盘。

事实来源按优先级排列：

1. `AGENTS.md`：协作与安全边界。
2. `README.md`：运行、验证、部署入口。
3. `docs/spec/*.md`：产品、架构、数据、API、安全、测试、运维规范。
4. `docs/decisions/DECISIONS.md`：已拍板的架构与产品决策。
5. `DESIGN.md`：UI 设计意图。
6. `sql/schema.sql`、`server/`、`client/`：最终实现事实。

当文档与代码冲突时：先以代码验证当前行为，再在同一变更中修正文档或代码，不能留下“文档说 A、代码做 B”的状态。

## 2. 工作流程

开始任务前必须：

1. 查看 `git status`，确认工作区是否干净。
2. 阅读相关 SPEC 与实现，不凭历史记忆改代码。
3. 判断影响面：产品契约、API、schema、UI、测试、部署、生产数据。
4. 对不确定的行为写测试或做只读验证，禁止臆测。

完成任务前必须按影响面验证：

- 任意代码 / 文档：`npm run check`
- 服务端：`npm run test:server`；Windows workerd 失败时至少跑 `npm run test:server:local`
- 客户端：`npm run test:client`
- 构建：`npm run build`
- schema / migration：`npm run check:schema && npm run check:migrations`
- UI 视觉变更：`npm run build && npm run visual:check -- --baseline`

不要因为时间紧张跳过门禁。若某门禁本机不可用，必须在交付说明中明确说明。

## 3. 文档规则

- 仓库只保留当前有效的规范、决策记录和测试资产。
- 禁止新增日期式计划文档、过程报告、重复分析报告到仓库；过程内容放在 issue、PR 描述或本地，不提交。
- 产品/API/schema/安全契约变化时，必须同步修改对应 SPEC。
- 架构或产品方向变化必须先在 `docs/decisions/DECISIONS.md` 追加 ADR，状态只能是 `Proposed`、`Accepted`、`Superseded`。
- 被替代的决策不删除 ADR，标记 `Superseded` 并指向新 ADR。
- 不要把 Cloudflare 控制台截图、生产日志、密钥、用户数据写入文档。
- `docs/design/v7/` 是视觉测试基线，不是设计图库；只有 UI 有意变更时才更新。

## 4. 代码规则

- TypeScript strict，不使用 `any`、非必要断言或关闭检查。
- 服务端入口在 `server/index.ts`，业务入口按 `server/routes/` → `server/data/` / `server/lib/` 分层。
- 新增业务逻辑优先放入可测试的纯函数或 data 模块，不把 SQL、权限、审计、HTTP 协议混在一个 route 中。
- 所有跨用户资源查询必须带 `workspace_id`；对不可见资源统一 404，不泄露存在性。
- 高风险写操作必须考虑审计；能进入同一 D1 batch 的审计不要拆成独立写。
- 前端组件避免承担页面编排、数据请求、动作策略多重职责；优先拆 hook 与展示组件。
- UI 令牌与设计契约以 `DESIGN.md` 和 `client/src/index.css` 为准，不引入临时硬编码色值。
- 不提交 `client/dist`、缓存、日志、截图或本地环境文件。

## 5. 数据库规则

- 既有环境只使用 `migrations/`，禁止直接对生产执行手工 DDL。
- `sql/schema.sql` 是新环境全量建库入口，必须与迁移链最终态完全等价。
- 每次新增 migration 后运行 `npm run check:migrations` 与 `npm run check:schema`。
- 破坏性 migration 必须提供备份、回滚、验证与停写窗口说明。
- 迁移顺序固定：备份 → migration → 部署依赖新 schema 的代码 → 烟测。
- R2 对象不得随 D1 行直接物理删除；必须经过孤儿对象队列与引用复查。

## 6. 生产与安全红线

未获得用户明确指令时，禁止执行任何会改变生产状态的命令，包括但不限于：

- `wrangler deploy`
- `wrangler rollback`
- `wrangler d1 migrations apply --remote`
- `wrangler d1 execute --remote` 中的 INSERT / UPDATE / DELETE / DDL
- `wrangler secret put/delete`
- 删除或覆盖 R2 对象
- 修改 Cloudflare Access / DNS / WAF 配置

生产只读查询可以执行，但必须：

1. 明确说明目的；
2. 只查最小字段；
3. 不输出用户文件名、邮箱、token 等敏感值；
4. 不把结果写入仓库。

密钥只能存 Cloudflare secrets 或本地 `.dev.vars`，不得进入 Git、日志、测试快照或文档。

## 7. 提交与交付

- 提交信息使用中文 Conventional Commits：`feat:`、`fix:`、`refactor:`、`test:`、`docs:`、`chore:`。
- 一个提交只做一件明确的事；清理、重构、行为修正不混在一起。
- 交付说明必须包含：变更点、验证结果、未覆盖风险、下一步建议。
- 不以“应该没问题”作为结论；没有验证就明确写未验证。
