# 文档索引

本目录只保留当前有效的规范、决策记录和测试基线。历史计划、过程报告和过期迁移说明已从工作树清理；需要追溯时使用 Git 历史，不把历史稿重新提交回仓库。

## 当前规范

| 文档 | 变更时必须同步 |
|---|---|
| [spec/PRODUCT.md](./spec/PRODUCT.md) | 用户价值、功能范围、产品行为变化 |
| [spec/ARCHITECTURE.md](./spec/ARCHITECTURE.md) | 模块、依赖、运行拓扑、数据流变化 |
| [spec/DATA.md](./spec/DATA.md) | 表、索引、不变量、migration 变化 |
| [spec/API.md](./spec/API.md) | 端点、请求/响应、状态码、兼容性变化 |
| [spec/SECURITY.md](./spec/SECURITY.md) | 认证、授权、审计、分享、密钥变化 |
| [spec/TESTING.md](./spec/TESTING.md) | 测试策略、质量门禁、必测场景变化 |
| [spec/OPERATIONS.md](./spec/OPERATIONS.md) | 配置、部署、备份、回滚、监控变化 |
| [decisions/DECISIONS.md](./decisions/DECISIONS.md) | 架构/产品方向决策变化 |

根目录：

- `README.md`：运行与交付入口。
- `AGENTS.md`：AI / 协作规范。
- `DESIGN.md`：UI 设计契约。

## 文档生命周期

1. **规范**：描述当前系统，随代码同一 PR 更新。
2. **ADR**：记录不可逆或影响边界的决策；被替代时标记 `Superseded`，不删除。
3. **计划**：默认放 issue / PR，不入仓库；只有跨多个 release 的实施路线才允许临时文档，合并后必须删除。
4. **报告**：不入仓库；验收结果应转化为测试或规范中的不变量。

## 保留的测试资产

`design/v7/` 是 `scripts/visual-check.mjs` 的像素基线。不要删除、重命名或手动编辑；只有 UI 有意变更时通过 `npm run visual:check -- --update-baseline` 更新。
