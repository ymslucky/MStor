# 文档索引与上下文地图

本目录只保留当前有效的规范、决策记录和测试基线。历史计划、过程报告和过期迁移说明通过 Git 历史追溯，不重新提交到工作树。

## 1. 事实来源

| 文档 | 唯一职责 | 变更触发 | 权威实现参照 |
|---|---|---|---|
| [spec/PRODUCT.md](./spec/PRODUCT.md) | 产品边界、用户旅程、验收口径 | 功能、角色、保留策略变化 | `server/routes/**`、`client/src/pages/**` |
| [spec/ARCHITECTURE.md](./spec/ARCHITECTURE.md) | 拓扑、模块边界、数据流 | 模块、运行时、一致性策略变化 | `server/index.ts`、`server/**`、`client/src/**` |
| [spec/DATA.md](./spec/DATA.md) | 表职责、不变量、迁移策略 | schema、索引、数据保留变化 | `sql/schema.sql`、`migrations/**` |
| [spec/API.md](./spec/API.md) | 端点、错误码、兼容规则 | API 行为变化 | `server/routes/**` |
| [spec/SECURITY.md](./spec/SECURITY.md) | 认证、隔离、分享、审计、密钥 | 安全模型变化 | `server/middleware/**`、`server/routes/**` |
| [spec/TESTING.md](./spec/TESTING.md) | 测试策略与质量门禁 | 测试体系或覆盖率口径变化 | `test/**`、`client/src/**/*.test.*` |
| [spec/OPERATIONS.md](./spec/OPERATIONS.md) | 配置、发布、回滚、应急 | 部署或运维流程变化 | `.github/workflows/**`、`wrangler.jsonc` |
| [decisions/DECISIONS.md](./decisions/DECISIONS.md) | 不可逆决策与取舍 | 产品方向或架构决策变化 | 相关 SPEC |

根目录：

- `AGENTS.md`：AI 协作、上下文加载、生产红线。
- `README.md`：开发、验证、部署入口。
- `DESIGN.md`：UI 设计契约。

## 2. 按角色的最短阅读路径

### 新协作者

1. `README.md`
2. `AGENTS.md`
3. `spec/PRODUCT.md`
4. `spec/ARCHITECTURE.md`
5. 需要数据库时再读 `spec/DATA.md`

### 后端开发

1. `AGENTS.md`
2. `spec/ARCHITECTURE.md`
3. `spec/API.md`
4. `spec/DATA.md`
5. `spec/SECURITY.md`

### 前端开发

1. `AGENTS.md`
2. `DESIGN.md`
3. `spec/PRODUCT.md`
4. `spec/API.md`
5. `spec/TESTING.md`

### 运维 / 发布

1. `AGENTS.md`
2. `spec/OPERATIONS.md`
3. `spec/SECURITY.md`
4. `spec/DATA.md`

### AI 代理

1. `AGENTS.md` 的任务路由表；
2. 只加载任务相关的 SPEC；
3. 只检索相关实现与测试；
4. 不把历史稿、构建产物或生产敏感数据加入上下文。

## 3. 按任务的上下文包

| 任务 | 必读上下文包 |
|---|---|
| 修复 404 / 403 | `SECURITY` + `API` + access middleware + 权限测试 |
| 文件树 / 移动 / 回收站 | `DATA` + `ARCHITECTURE` + nodes/trash 实现与测试 |
| 上传 / 下载 | `API` + `DATA` + uploads/files 实现与测试 |
| 分享 | `SECURITY` + `API` + shares 实现与测试 |
| schema 变更 | `DATA` + `OPERATIONS` + schema/migration 校验 |
| UI 调整 | `DESIGN` + `PRODUCT` + `TESTING` + 对应组件测试 |
| 发布回滚 | `OPERATIONS` + `SECURITY` + workflow / wrangler |
| 依赖升级 | `SECURITY` + `TESTING` + package / lock / CI |

## 4. 文档生命周期

1. **规范**：描述当前系统，随代码同一提交更新。
2. **ADR**：记录不可逆或影响边界的决策；被替代时标记 `Superseded`，不删除。
3. **计划**：默认放 issue / PR，不入仓库。
4. **报告**：不入仓库；验收结论必须转化为测试或规范不变量。
5. **临时上下文**：会话内使用，不提交。

## 5. 保留的测试资产

`design/v7/` 是 `scripts/visual-check.mjs` 的像素基线。不要删除、重命名或手工编辑；只有 UI 有意变更时通过：

```bash
npm run visual:check -- --update-baseline
```

更新，并单独提交。
