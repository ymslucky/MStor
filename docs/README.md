# 文档索引

> 维护约定：**同一主题只允许一份权威文档**。方案演进时原地升级版本号（v2.0 → v2.1），
> 被取代的旧稿移入 `archive/` 并在顶部加归档横幅，不删除（保留决策证据）。

## 当前权威

| 文档 | 内容 | 状态 |
|---|---|---|
| [plans/2026-10-20-mstor-saas-v2.md](./superpowers/plans/2026-10-20-mstor-saas-v2.md) | **MStor SaaS 化方案 v2.1**：决策记录、树模型选型（§4.2）、预览与 Range 协议（§4.3）、关键链路（§4.4）、P0–P3 分期与验收 | 权威，唯一开工依据 |
| [../README.md](../README.md) | 项目现状说明：技术栈、认证、数据库、部署与回滚 | 权威（现状） |
| [reports/2026-09-28-feature-upgrade-report.md](./reports/2026-09-28-feature-upgrade-report.md) | 功能地图（历史梳理，功能归属仍可参考） | 参考 |
| [reports/2026-09-28-ux-optimization-report.md](./reports/2026-09-28-ux-optimization-report.md) | 上一轮 UX 优化记录 | 参考 |
| [functional-audit.md](./functional-audit.md) | 2026-10-22 功能与操作体验验证：逐功能矩阵、已修缺陷、真机回归清单 | 记录 |
| [video-pipeline-analysis.md](./video-pipeline-analysis.md) | 视频缩略图/预览：当前方案、Cloudflare Stream/Mux/MediaConvert/GCP 对比、分步演进建议 | 记录 |
| [component-ux-audit.md](./component-ux-audit.md) | 组件用户体验评估：选择/列表/操作入口/工具栏/弹窗评分与优先级 | 记录 |
| [d1-query-optimization.md](./d1-query-optimization.md) | D1 生产查询分析：Top SQL、索引/planner 修复、优化前后读取行数 | 记录 |
| [audit-system-analysis.md](./audit-system-analysis.md) | 审计体系评估：act-as 重复日志根因、Cloudflare/AWS/GCP/NIST 对比、分步重构 | 记录 |
| [workspace-sharing-analysis.md](./workspace-sharing-analysis.md) | 空间共享决策记录：收敛为个人云盘，仅保留外链分享；成员 UI 已移除 | 记录 |
| [../DESIGN.md](../DESIGN.md) | OpenDesign 9 段 schema 的 MStor 设计意图（色/字/间距/组件/动效/语气/品牌/反模式） | 权威 |

## 阅读顺序（新人/接手）

1. `../README.md` —— 它现在跑在哪、怎么部署、怎么回滚。
2. `superpowers/plans/2026-10-20-mstor-saas-v2.md` §0 决策记录 —— 哪些已经拍板、哪些还是假设。
3. 同文件 §1–§4 —— 现状实测、目标架构、数据模型与两条协议（树模型、预览）。
4. 同文件 §5–§8 —— 分期、验收门禁、风险与工期口径。

## 归档（已被取代，勿作为依据）

| 文档 | 为何归档 |
|---|---|
| [archive/2026-10-18-mstor-refactor-plan.md](./superpowers/archive/2026-10-18-mstor-refactor-plan.md) | 收敛式重构方案（A/B1–B7、C1–C5 工程债核实记录仍有效，编号在 v2.1 中被引用） |
| [archive/2026-10-20-mstor-commercial-plan.md](./superpowers/archive/2026-10-20-mstor-commercial-plan.md) | 单租户商业级方案（假设保留 ≤50 用户的私有部署；多租户部分已被 v2.1 取代） |

## 历史稿

`superpowers/specs/` 与 `superpowers/plans/` 中 2026-09-27～2026-10-16 的文档属于历史稿：
部分设计（OIDC 会话、WebDAV）已随实现删除，**以 README 与 v2.1 为准**。

## 其他约定

- `client/dist/index.html` 是刻意保留的占位产物（`.gitignore` 白名单放行），`wrangler dev` 需要该目录存在；直接访问 :8787 且未 build 时页面是坏的，属预期。
- 提交信息用中文 conventional commits；纯结构调整用 `refactor`，行为修正用 `fix` 并在正文写明影响。
