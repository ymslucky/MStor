> **已归档（2026-10-20）**：内容已合并入 [../plans/2026-10-20-mstor-saas-v2.md](../plans/2026-10-20-mstor-saas-v2.md)，以该文件为唯一权威。本文件仅作历史证据保留，不再维护。

# MStor 商业级演进与技术设计

> **版本** v2.0 · **日期** 2026-10-20 · **状态** 待评审  
> **范围** Cloudflare 免费版约束下的架构优化、数据库与关键链路设计、商业级功能、权威 UX 标准  
> **前版** `2026-10-18-mstor-refactor-plan.md`（内部重构导向，已被本方案取代；其中已核实的工程债作为附录 F 保留）

**本版重点**：上一版偏“路线图”；v2.0 把技术设计放在同等位置，新增 **§2.9 数据库设计与树模型（含闭包表完整方案）**、**§2.10 在线预览与 Range 协议**、**§2.11 上传/分享/搜索/权限/版本/缓存等关键链路**。每个设计都给出 SQL/算法/边界条件/验收，不停留在“要做”。

**阅读指南**：技术结论看 §0；成本与子请求看 §2.1–2.8；数据库看 §2.9；预览看 §2.10；其余关键链路看 §2.11；功能规格看 §3；UX 看 §4；排期/测试看 §5；需要拍板看 §6；DDL/来源看 §7。本方案是设计与实施计划，不是已实现代码；开工前先确认第 6 节决策。

---

## 0. 执行摘要

### 0.1 一句话结论

**免费版可以支撑一个家庭/小团队规模的 MStor，但前提是把架构从“单次大请求”改成“多次小请求 + 集合式 SQL + 有界定时任务”；真正需要花钱的不是算力，而是超过 10GB 的 R2 存储（$0.015/GB/月）。商业级的关键也不是功能数量，而是数据安全、可审计、可恢复、可访问、可度量。技术上：树用“邻接表 + 物化路径”（闭包表已评估，1.0 不采用），预览用 `GET/HEAD + Range + ETag`，上传/分享/搜索/版本按状态机与原子计数落地；详见 §2.9–2.11。**

### 0.2 五个关键判断

| # | 判断 | 依据 |
|---|---|---|
| 1 | **请求数不是瓶颈**：静态资源免费不限量，API 家庭用量约为 100k/天的 0.2%–2% | `run_worker_first` 仅 `/api/*`；Workers 静态资源免费 |
| 2 | **单次 50 子请求才是硬约束**：D1 查询、R2 操作、`fetch` 都计入；批量还原 100 项约 600–800 次子请求 | 批量接口逐项循环；cron 一次跑四个任务且孤儿清扫 500×2 查询 |
| 3 | **R2 10GB 是唯一现实成本**：约 2,000 张 5MB 照片或 50 个 200MB 视频；超出后按 $0.015/GB/月，50GB 仅约 $0.60/月 | 家庭媒体库通常 50–200GB，为此扭曲产品体验不值得 |
| 4 | **商业级差距在“信任基础设施”**：版本、审计、备份恢复、分享治理、全局上传、存储治理、无障碍，而不是再堆预览格式 | 当前 schema 无版本/审计/Token/收藏表；分享无下载上限；无 ErrorBoundary/CSP |
| 5 | **UX 不是“再美化”**：当前已有虚拟列表、骨架屏、空状态、44px 触控、`role=alert`、`aria-live`、暗色与减少动效等优点；缺口集中在弹窗焦点、全局上传生命周期、缩略图、错误可恢复性、移动端手势与性能预算 | 逐项代码核实，见 4.3 |

### 0.3 推荐路线

- **架构**：Workers Free + D1 Free + R2 Free 起步；R2 超出 10GB 按量付费；只有在需要 OWASP 级密码哈希、超大批量或 ZIP 流式导出时才升级 Workers Paid（$5/月）。
- **功能**：先做“商业级 1.0 信任底座”（存储治理、全局上传、分享治理、审计、备份恢复、版本），再做协作与媒体增强。
- **体验**：以 WCAG 2.2 AA、NN/g 十原则、WAI-ARIA APG、Core Web Vitals 为验收标准，不做“看起来高级”但不可度量的改动。
- **节奏**：Phase 0 基线（第 1 周）→ Phase 1 免费版加固 + 数据/预览协议（第 2–6 周）→ Phase 2 商业级 1.0 功能（第 7–11 周）→ Phase 3 体验/合规/发布（第 12–15 周）。单人全栈约 15 周；严格 90 天则冻结 P1（PDF.js/Office/时间线/内部共享）。

### 0.4 技术设计结论（本版新增）

1. **树模型**：保留“邻接表 + 物化路径”作为主模型；闭包表被认真评估，但因 D1 Free 的写入放大和移动成本，不作为 1.0 主模型。若要求权限继承/多父 DAG，按 §2.9.4 的迁移方案切换到闭包表。
2. **预览不是 iframe 一嵌了之**：服务端必须完整实现 `GET/HEAD + Range + If-Range + ETag + 206/416/304`；PDF/视频/文本/Office 分别有不同策略。详见 §2.10。
3. **上传/分享/搜索/版本**：按 §2.11 的状态机、幂等键、原子计数、FTS5 前缀策略落地；这些是 1.0 的 P0/P1，不是“后置优化”。

### 0.5 需要拍板的 9 个决策

见第 6 节。最关键的四个：

1. **免费优先还是商业优先**：免费优先（推荐）意味着接受 100k PBKDF2 + 批量拆分；商业优先意味着 Workers Paid $5/月 + 600k PBKDF2。
2. **存储计量口径**：回收站/版本是否计入配额（推荐计入，否则 R2 实际占用会悄悄超过 10GB）。
3. **产品边界**：家庭/亲友私有云（≤50 用户，本方案假设）还是对外 SaaS（需要 Workspace 多租户、计费、合规，另立方案）。
4. **树模型**：物化路径（推荐，D1 Free 更优）还是闭包表（祖先/权限查询更优雅，但写入放大）；新增 D9。

---

## 1. 方案边界与原则

### 1.1 目标

1. **成本可预测**：在免费额度内运行家庭规模；超出时只产生可解释的 R2 存储费用，不出现“账单惊吓”。
2. **商业级可信**：数据不丢、操作可审计、故障可恢复、分享可控、权限可验证。
3. **体验有标准**：核心流程达到 WCAG 2.2 AA、Core Web Vitals 良好、键盘/移动端可用，而不是只覆盖桌面鼠标路径。
4. **可演进**：不拆微服务、不换框架、不引入不必要的中间件；每个阶段可部署、可回滚、可中止。

### 1.2 非目标

- 不做多租户/计费/对外 SaaS（除非第 6 节决策改为 SaaS）。
- 不做实时协作编辑、Office 在线编辑、服务端视频转码、端到端加密。
- 不做 Cloudflare Images/Image Resizing 等付费媒体处理（Phase 1–3）。
- 不追求“把 10GB 用满”的极限压缩；不牺牲原图质量换免费额度。
- 不以“免费版有 SLA”为前提；Cloudflare Free 不提供商业 SLA。

### 1.3 设计原则

1. **Free-first，付费有明确触发条件**：每一处设计先算免费额度；超过时给出可解释的升级点，而不是隐藏失败。
2. **稀缺资源是“单次子请求”，不是“请求数”**：大操作拆成多个小请求；每个请求/定时任务 ≤ 40 个子请求。
3. **集合式优于逐项循环**：SQL 用 `IN`/范围/批量 UPDATE；R2 用批量 delete；禁止无界 `for` 循环里发 D1/R2 调用。
4. **先测量再优化**：所有性能/成本结论以 Workers Logs、D1 `meta.rows_read/written`、R2 操作计数、Lighthouse/axe 实测为准。
5. **安全与数据完整性优先于便利**：配额、分享上限、删除、还原必须在服务端原子校验。
6. **商业级 = 可信 + 可恢复 + 可访问**，不是功能清单的长度。
7. **UX 变更必须有标准与验收**：每个工作包绑定 NN/g 原则、WCAG 条款或 CWV 指标，不做主观“更好看”。

## 2. 第一部分：Cloudflare 约束下的技术架构与关键链路

### 2.1 免费版事实基线（2026-10）

| 资源 | Free 额度 | 对 MStor 的含义 |
|---|---|---|
| Worker 请求 | 100,000/天 | 仅 `/api/*` 与 cron；家庭用量约 0.2%–2% |
| Worker CPU | 10 ms/次（含 cron） | 普通路由 2–4ms；分享密码 PBKDF2 100k 已贴近上限 |
| 子请求 | **50/次调用** | D1 查询、R2 操作、`fetch` 都计入；本方案第一约束 |
| 静态资源 | **免费、不限量** | SPA 的 JS/CSS/HTML 不消耗 Worker 请求 |
| D1 读 | 5,000,000 行/天 | 短查询 `LIKE '%q%'` 全扫是主要风险 |
| D1 写 | 100,000 行/天 | 上传/批量删除远低于上限 |
| D1 存储 | 5 GB/账户；单库 500 MB | 元数据为主，家庭规模充足 |
| D1 查询/调用 | 50（Free）/ 1,000（Paid） | 与子请求同源；批量接口需拆分 |
| R2 存储 | 10 GB-month/月 | **唯一的现实容量瓶颈与费用来源** |
| R2 Class A | 1,000,000/月 | 分片上传、PUT；家庭规模 <5% |
| R2 Class B | 10,000,000/月 | 下载/预览/HeadObject；家庭规模 <1% |
| R2 出口 | 免费 | 视频/大文件下载无带宽费 |
| Access | 50 用户免费 | 家庭/小团队足够；超过后 $7/用户/月 |
| Cron | 5 个触发器；10ms CPU/次 | 当前只用 1 个日任务，且四件事挤在一次调用 |
| Workers Logs | 200,000 事件/天，保留 3 天 | 足够做结构化日志与成本观测 |
| 限流 | Free 可配置有限规则（1 条/10 秒/IP，具体字段以控制台为准） | 用于分享密码爆破防护 |

> 官方来源与更新时间见附录 A。Cloudflare 价格/额度会调整，实施前以控制台为准。

### 2.2 当前请求路径与计费

```
浏览器
 ├─ SPA 资源（HTML/JS/CSS/字体）──> Workers Assets（免费、不限量）
 ├─ /api/* ──> Worker（Access JWT 校验）──> D1（元数据）
 │                                      ├─ R2（内容流式读取，Class B）
 │                                      └─ R2 S3 预签名（分片直传，Class A）
 ├─ /auth/renew ──> SPA 导航（Asset），由 Access 在边缘重新裁决会话
 └─ Cron（每日 03:00）──> 一次 Worker 调用内并行跑 4 个任务
```

关键事实：

- `wrangler.jsonc:10-15` 的 `run_worker_first` 仅匹配 `/api/*`，所以 SPA 资源走免费静态资源；不要改成 `/*`，否则每次页面加载都会消耗 Worker 请求。
- 小文件上传经 Worker（`PUT /api/files/upload`），大文件分片由浏览器直传 R2 预签名 URL，文件字节不经过 Worker。
- 每次 D1 查询都是一次子请求；`.batch()` 是否按“1 次调用”还是“每条语句”计入限额，官方口径不完全直观，**本方案保守按每条语句计**，实施时用计数器与线上日志复核。
- 每日 cron 在一次调用中 `Promise.all` 四个任务（`server/index.ts:34-44`），共享同一个 50 子请求预算；这是当前最严重的隐藏故障点。

### 2.3 家庭规模用量模型

假设：轻量文档库 3 个活跃用户、2,000 个节点、8GB；家庭媒体库 5 个用户、20,000 个节点、80GB。API 请求按每次会话 10 次、预览 1 次/张、搜索 1 次/词估算。

| 指标 | 轻量文档库 | 家庭媒体库 | 免费额度 | 占比（媒体库） |
|---|---:|---:|---:|---:|
| 存储 | 8 GB | 80 GB | 10 GB | **800%**（超出 70GB ≈ $1.05/月） |
| API 请求/天 | ~240 | ~1,200 | 100,000 | 1.2% |
| D1 读/天 | ~50,000 | ~2,200,000 | 5,000,000 | 44%（短查询最坏） |
| D1 写/天 | ~500 | ~3,000 | 100,000 | 3% |
| R2 Class A/月 | ~1,000 | ~35,000 | 1,000,000 | 3.5% |
| R2 Class B/月 | ~2,000 | ~10,000 | 10,000,000 | 0.1% |
| CPU p95（普通路由） | 2–4 ms | 2–4 ms | 10 ms | 安全 |
| CPU（分享密码校验） | 10–12 ms | 10–12 ms | 10 ms | **临界/超限** |

结论：

1. **请求数、R2 操作数都有 1–2 个数量级余量**，不需要为“流量费”做架构变形。
2. **D1 短查询搜索**在 2 万节点 + 每天 100 次时已接近 5M 行；这是需要优化的真实读放大。
3. **存储是唯一会稳定增长并产生费用的维度**；10GB 对家庭媒体库明显不够，但超出的单价极低。
4. **分享密码校验的 CPU** 是免费版最可能触发 1102/超时的路径；需要限流与明确的升级决策。

### 2.4 五个硬约束与现状风险

#### 2.4.1 子请求 50/次：最严重的架构风险

当前批量/定时实现大量采用“逐项 `await`”，每一项至少 1 次 D1/R2 调用。按客户端每批 100 项、D1 每次 1 子请求保守估算：

| 端点/任务 | 当前实现 | 估算子请求 | 50 限额 | 结论 |
|---|---|---:|---:|---|
| `POST /api/trash/batch-restore`（100 项） | 每项 `restoreTrashNode`：查节点、查父、查重名、求和、batch 更新（`trash.ts:298-313`） | **600–800** | 50 | 必然失败 |
| `POST /api/files/batch-move`（100 个目录） | 每个目录一次 `isDescendant` 查询（`trash.ts:186-189`） | **~105** | 50 | 目录数 >~40 失败 |
| `POST /api/trash/batch-purge`（500 项） | 集合式删除 + 分片 + 批量登记孤儿（`trash.ts:60-106`） | ~30–40（按 batch=1） | 50 | 临界；若按语句计则远超 |
| 每日 cron（四任务并行） | 过期回收站逐项 + 孤儿 500×2 查询 + 遗弃分片逐项 + 配额校准（`index.ts:34-44`） | **>2,000** | 50 | 必然失败 |
| `GET /api/files` | 鉴权 + 父目录 + 列表 + 面包屑 | 4–6 | 50 | 安全 |
| `GET /api/search` | FTS/短查询 + 祖先名分片 | 3–5 | 50 | 安全 |
| 小文件上传 | 鉴权 + 父目录 + 配额 + R2 put + 插入 + 配额更新 | 8–10 | 50 | 安全 |
| 分片 complete | 鉴权 + 会话 + HeadObject + 插入 + 配额更新 + 删会话 | 8–12 | 50 | 安全 |

为什么测试没发现：Miniflare 本地不强制 Workers 账户计划的 50 子请求上限；需要**显式计数器**在测试中断言（见 5.3）。

**设计规则（全方案统一）**：

1. 每个 Worker 调用/定时任务硬预算 **≤40 个 D1/R2/fetch 子请求**，留 10 个给鉴权、日志与重试。
2. 大操作拆成多个 HTTP 请求，由客户端带进度循环；接口返回 `{ processed, failed, remaining }`，客户端续跑。
3. 服务端拒绝超过预算的批量（按端点设上限），不要“收下 500 项再逐项超限”。
4. 集合式 SQL / 多行 INSERT / 多键 `R2.delete(keys[])` 优先。
5. cron 按任务拆成独立触发器，每个触发器处理有界数量（20–40）。
6. 所有批量端点用测试计数器验证最坏输入。

> **核心思路反转**：免费版下“请求数”充裕（100k/天），“单次子请求”稀缺（50/次）。把 500 项塞进一个请求是最差策略；拆成 10 个 50 项请求反而正确。

#### 2.4.2 CPU 10ms：分享密码是临界点

- `server/lib/crypto.ts:33` 使用 PBKDF2-HMAC-SHA256、100,000 次迭代。本机 WebCrypto 基准约 **11.5ms**（Node 22，仅量级参考）；Workers 上需用 `wrangler tail`/Workers Logs 实测。
- 免费版每次调用 10ms CPU；PBKDF2 很可能等于或超过预算。Free 对偶发超限有一定容忍，但不能作为设计前提，尤其是分享密码可被爆破时。
- JWT 验签、路由、JSON 序列化通常在 2–5ms，安全；大列表/大 JSON 会放大 CPU，需分页。
- OWASP 当前对 PBKDF2-HMAC-SHA256 的建议是 **600,000 次**；100k 仅适合低风险分享口令，且应配合限流。

**决策**：免费优先 → 保留 100k + WAF 限流 + 记录 CPU；商业级安全承诺 → Workers Paid（$5/月，5 分钟 CPU）+ 600k 迭代 + 限流。不要在没有限流的情况下暴露密码校验。

#### 2.4.3 R2 10GB：唯一的容量与费用瓶颈

- 10GB ≈ 2,000 张 5MB 照片 / 50 个 200MB 视频 / 10,000 个 1MB 文档。
- 当前默认每用户配额 10GiB（`wrangler.jsonc:35`、`nodes.ts:193`），但没有全局预算；多个用户各自 10GiB 会直接超过 R2 免费额度。
- **计量语义漏洞**：软删除时立即扣减 `used_bytes`（`trash.ts:163`），但 R2 对象要等 30 天回收站到期/彻底删除才消失。结果是“配额看起来空了，R2 实际仍占满”，免费额度会悄悄超限。
- 回收站、版本、缩略图都占用 R2；必须纳入计量或单独展示。

**建议**：

1. 增加全局存储预算（默认 10GB，可配置），上传前同时校验“用户配额 + 全局预算”。
2. 存储展示拆成：活跃文件 / 回收站 / 版本 / 缩略图；回收站与版本默认计入总占用（与 Google Drive/Dropbox 行为一致）。
3. 80%/95%/100% 三档提示；100% 阻止上传并给出管理员 CTA。
4. 不为了 10GB 做有损压缩；超出按量付费（50GB 约 $0.60/月，200GB 约 $2.85/月）。

#### 2.4.4 D1 5M 行/天：短查询搜索与无界列表

- 3 字符以上走 FTS5 trigram（`search.ts:14-19`），有索引，成本可控。
- 1–2 字符退化为 `name LIKE '%q%'`（`search.ts:20-24`），会扫描该用户全部活跃节点。2 万节点 × 100 次/天 = 2M 行；250 次/天就触顶。
- `listChildren` 没有 `LIMIT`（`nodes.ts:91-96`），大目录一次返回全部；行读与 JSON/CPU 都放大。
- 回收站列表有 `LIMIT 500`，但无分页；分享列表也需检查上限。
- 每日配额校准对 `nodes` 全表 `SUM`（`index.ts:40-43`），行读 = 节点总数/天；10 万节点时 2% 预算，可接受，但需监控。

**建议**：短查询改前缀 `q%`（走 `(owner_id, name)` 索引）或强制 ≥3 字符并提示；列表游标分页（200/页）；搜索分页 + 过滤；用 `EXPLAIN QUERY PLAN` 纳入测试。

#### 2.4.5 100k 请求/天：充裕，但分片预签名在浪费

- 家庭媒体库约 1,200 API 请求/天，仅为额度 1.2%；即使 10 倍增长也安全。
- 大文件每个分片都单独请求 `/part-urls`（`client/src/api/uploads.ts:209-212`），1GB/16MB = 64 个请求；服务端其实已支持一次传 1,000 个分片号（`server/routes/uploads.ts:32-42`），只是客户端逐个调用。
- 静态资源免费；不要用边缘缓存来“省请求”——Workers 在缓存之前执行，缓存命中仍计请求（静态资源除外）。

**建议**：init/续传时分块批量预签名（建议 16–32 个/请求，平衡请求数与签名 CPU；服务端已支持一次 1,000 个，但不要一次签完），过期后只刷新剩余分片。1GB/16MB=64 片，约 2–4 个预签名请求，而不是 64 个。

### 2.5 架构优化清单（按优先级）

| ID | 优先级 | 优化 | 预期效果 | 验收 |
|---|---|---|---|---|
| **A1** | P0 | **子请求预算治理**：集合式 SQL、批量 R2、拆分大请求、cron 拆分 | 消除 1102/“too many subrequests”类故障；最坏端点 ≤40 | 计数器测试：restore/move/purge/cron 全部 ≤40 |
| **A2** | P0 | **全局存储预算 + 物理占用计量** | 不超 R2 10GB 免费线；费用可解释 | 并发上传不能突破预算；80/95/100% 提示 |
| **A3** | P0 | **D1 读放大治理**：前缀短查询、分页、索引、查询计划 | 2 万节点下短搜索从 2M 行/天降到 <10 万 | `EXPLAIN QUERY PLAN` 无全表扫描；列表 ≤200 行/页 |
| **A4** | P0 | **CPU 预算**：测量 PBKDF2/JWT/JSON；WAF 限流；必要时 Paid | 分享密码不被 10ms 卡死/爆破 | p95 CPU <8ms（免费）或明确升级 |
| **A5** | P1 | **批量分片预签名 + 幂等上传** | 1GB 文件从 66 个请求降到 ~5–7 个；重试不重复 | 分块返回预签名 URL；重复 init 不产生双份 |
| **A6** | P0 | **R2 生命周期与批量删除** | 孤儿/分片清理不爆子请求；删除成本为 0 | 40 个孤儿 ≤5 子请求；7 天自动中止未完成分片 |
| **A7** | P1 | **条件请求与浏览器缓存** | 重复预览/拖动进度条不打 R2 | `If-None-Match` 返回 304；图片/视频 immutable |
| **A8** | P0 | **定时任务重设计**：5 个独立触发器、有界批量 | cron 不再必然超限；任务互不拖累 | 每个触发器 ≤40；连续 7 天无失败 |
| **A9** | P1 | **免费版优雅降级**：429/1027/配额/离线 | 额度耗尽时不是白屏，而是可解释状态 | SPA 仍可加载；API 显示重试/维护提示 |
| **A10** | P0 | **可观测性与成本仪表**：结构化日志、请求 ID、子请求计数 | 能看到每个端点的成本与失败 | 每个请求日志含 route/status/ms/d1/r2/subrequests |

#### A1：子请求预算治理（本方案的核心工程）

**实现模式**：

1. **移动目录零查询判断**：目标父行已加载，直接检查 `targetParentId === dir.id`，或 `targetParent.path` 按 `/` 分段后包含 `dir.id`（物化路径，避免子串误判）；删除 `moveMany` 中每个目录一次 `isDescendant` 的循环（`trash.ts:186-189`）。100 个目录从 ~105 子请求降到 ~7（按 batch=1；若按语句计则按 40 预算拆成 3 批）。
2. **批量还原分组化**：先一次取回所有待还原节点与目标父目录，再按父目录分组一次性取重名集合，在 JS 中分配 `name (2)` 等后缀，最后批量 UPDATE。每组父目录 1 次查询；父目录种类 >20 时返回 `remaining`，客户端续跑。**只把 100 项改成 10 项/批不够**：10 项 × 6 查询仍可能 60，必须先把逐项查询合并为按父目录的集合查询。
3. **批量彻底删除**：每请求最多 90 个根；子树闭包用范围查询；孤儿登记用多行 `INSERT`（45 行/语句，避免 100 绑定上限）；R2 删除交给有界 cron，不在请求内逐项删。超大子树（>2,000 行）用任务表分页删除，避免单语句过大/超时，客户端显示进度。
4. **cron 拆分**：见 A8；每个任务独立调用，不再四任务共享 50 预算。
5. **端点上限表**：由 `parseIds` 的统一 500 改为按端点设置（restore 10/批、move 100/批、soft delete 100/批、purge 90/批），客户端读取 `remaining` 循环。
6. **预算中间件**：包装 `env.DB`/`env.BUCKET` 计数；超过 40 抛 `SUBREQUEST_BUDGET`，在测试中直接失败，线上返回 503 + `Retry-After`（并记录）。
7. **测试计数器**：Miniflare 不强制计划限额，必须用 Proxy/包装器统计每个端点的 D1 语句、R2 操作、`fetch` 次数，断言最坏输入。

> 目标值假设 `db.batch()` 按 1 次调用计；若线上/文档口径为“每条语句计 1 次”，则把批量进一步拆小或改用单条多行 SQL，最终仍以 ≤40 为硬约束。**不要用“本地能跑”推断线上不会超限。**

**客户端配合**：批量操作显示“已处理 X/Y”，失败项可重试；不要因为拆请求而让用户重复点击。服务端操作尽量幂等（软删/还原/移动目标相同视为成功）。

#### A2：全局存储预算与计量

- 新增 `storage_stats(id=1, used_bytes, updated_at)` 或复用 `settings` 单行；所有增加/减少物理占用的写入点原子更新。
- 上传预检：`UPDATE storage_stats SET used_bytes = used_bytes + ? WHERE used_bytes + ? <= budget`；用 `meta.changes` 判断是否成功，避免并发穿透。
- 采用“预留-确认/释放”：init/put 前预扣，失败/取消释放，complete 校验后确认；单用户配额同样用原子 `UPDATE ... WHERE used_bytes + ? <= quota`。
- 计量拆分为：`active_bytes`、`trash_bytes`、`version_bytes`、`thumb_bytes`；总占用 = 四者之和（或至少把 trash/version 计入总量）。
- 每用户配额仍保留（默认 10GiB，可管理员调整），但全局预算优先；建议家庭默认“共享池 10GB + 单用户 5GB 上限”，避免一人占满。
- 每日校准：一次 `SUM` 更新（现有）；同时对比 R2 实际对象数/字节（可选，需额外 API）。
- 展示：设置页 + 顶栏存储条 + 管理员页；回收站显示“30 天后释放 X GB”。
- 全局预算按逻辑 `SUM(size)` 保守计量：秒传/复制共享对象会高估实际 R2 用量，但绝不会漏计；精确物理计量（对象 ref 计数）放 P1。单用户配额同样按逻辑大小。
- 建议改变软删除语义：**软删除不扣减总占用**，彻底删除才扣减；否则回收站/版本会成为“看不见的 R2 占用”。这是第 6 节决策 D3。
- 切换语义前必须全量重算并回填 `storage_stats`/`users.used_bytes`（含回收站/版本），否则上线即可能超限；回填脚本先在 staging 演练。

#### A3：D1 读放大治理

1. 短查询（1–2 字符）改 `name LIKE 'q%'` + `LIMIT 20`，提示“前缀匹配；输入 3 个字符可全文搜索”；新增/确认 `(owner_id, name)` 部分索引。
2. ≥3 字符保持 FTS5 trigram；加 `LIMIT 100` 与游标分页。
3. `listChildren` 增加 `LIMIT 200` + 游标（`is_dir DESC, name, id`）；客户端无限滚动（已有虚拟列表）。
4. 搜索增加类型/大小/时间/分享状态过滤；过滤条件走索引，避免客户端全量过滤。
5. 回收站列表分页（当前 `LIMIT 500` 固定）。
6. 管理页统计用预聚合/单条 GROUP BY，禁止 N+1；每日校准保留。
7. 为高频查询写 `EXPLAIN QUERY PLAN` 快照测试，出现 `SCAN nodes` 即失败（允许 FTS 虚表扫描）。

#### A4：CPU 预算

- 线上测量：在 share unlock、JWT 中间件、列表接口包 `performance.now()`，日志输出；用 Workers Logs 的 invocation CPU 对照。
- 分享密码：保留 100k + 单 IP 10 秒限流 + 失败审计；若要求 OWASP 600k，升级 Workers Paid（$5）并把迭代数做成配置。
- 大列表分页；避免一次返回 10k 行 JSON。
- 客户端哈希（`hash-wasm`）目前在主线程按 8MB 分块计算（`api/uploads.ts:31-43`），大文件会阻塞 INP；移到 Web Worker，并只对 ≤64MB 文件做秒传哈希（或上传后后台计算）。
- 不在 Worker 内做图片缩放/压缩/ZIP 压缩；这些是 CPU 杀手。

#### A5：请求与分片

- init 响应分块返回预签名 URL（建议 16–32 个/请求；服务端已支持 1,000 个 `partNumbers`，`uploads.ts:32-42`）；客户端按 16MB 分片直接 PUT。
- 预签名 URL 有 1 小时有效期；续传时只刷新未完成/过期分片，分块批量请求。
- 上传 init 加 `idempotencyKey`（客户端 UUID），唯一索引防止网络重试产生双份会话/节点。
- R2 CORS 仅允许生产域名，方法 `PUT/GET/HEAD`，暴露 `ETag`；预签名 URL 1 小时有效，不写入日志。
- 小文件 60MB 上限保持不变（免费 zone 请求体 100MB，留安全余量）。

#### A6：R2 生命周期与批量删除

- 孤儿清扫改为：`SELECT 40 keys` → 一次 `SELECT r2_key FROM nodes WHERE r2_key IN (...)` → JS 求差集 → `BUCKET.delete(unreferenced[])`（一次调用，最多 1,000 键）→ 一次 `DELETE FROM orphan_objects WHERE r2_key IN (...)`。总计约 4 次子请求。
- 彻底删除节点时，R2 对象不立即逐个删除；写孤儿表，由 cron 宽限期后清理（现有设计正确）。
- 依赖 R2 默认生命周期：未完成分片 7 天后自动中止（以账户规则为准）；应用层 24h `abortStaleUploads` 保留但限量 20。
- 缩略图对象与节点同生命周期；彻底删除时一并登记 orphan（或独立清理）。
- **孤儿判定必须同时检查 `nodes.r2_key`、`file_versions.r2_key` 与 `nodes.thumb_key`**；只查 nodes 会误删仍被版本/缩略图引用的对象。
- 定期检查 R2 生命周期规则，避免“以为会自动删，其实没有”。

#### A7：条件请求与缓存

- `serveObject` 已有 ETag（`"node.id"`）与图片一年 immutable（`serve.ts:19,29`）；增加：
  - 请求带 `If-None-Match` 且匹配 → 直接 304，不读 R2。
  - 视频/音频也使用 `private, max-age=31536000, immutable`（内容不可变，同名修改=新 node），改善拖动进度条回访。
  - 文档/PDF 用 `private, max-age=3600` + ETag，兼顾删除后的新鲜度。
- 浏览器缓存是免费收益；不要依赖边缘缓存省 Worker 请求（Workers 在缓存前执行，命中仍计请求）。
- 静态资源由 Workers Assets 自动缓存；构建产物文件名带 hash，HTML 不缓存。

#### A8：定时任务重设计

| 触发器 | 频率 | 任务 | 预算 |
|---|---|---|---|
| `*/15 * * * *` | 每 15 分钟 | 孤儿对象清扫（40 个/次） | ~4 |
| `10 * * * *` | 每小时 | 遗弃分片会话（20 个/次） | ~22 |
| `0 3 * * *` | 每日 03:00 | 回收站彻底删除（20 根）+ 过期版本（20 个） | ~30–40 |
| `30 3 * * *` | 每日 03:30 | 配额校准 + 审计/通知保留 | ~4 |
| `0 4 * * *` | 每日 04:00 | 通知生成/临时数据清理（可选） | ~2 |

Free 允许 5 个 cron 触发器；上表正好 5 个。每个任务独立失败、独立重试；日志记录处理数量与耗时。若孤儿产生速度 > 40/15 分钟（异常故障），提高频率或临时用 Paid，而不是恢复“一次扫 500”。

**实现要点**：所有清理查询必须带 `LIMIT`；回收站一次取 20 个根，按 owner 分组（最多 5 组/次）调用集合式 `permanentDeleteMany`，禁止 `for` 循环逐根 `permanentDeleteNode`；版本清理用一条 `DELETE ... WHERE expires_at < ? LIMIT 20` + 孤儿登记；遗弃分片选 20 个，`Promise.all` abort 后一次批量删 D1 行（避免每项 2 次子请求）。

#### A9：免费版优雅降级

- 100k 请求耗尽：静态资源仍免费服务，SPA 能打开；`/api/*` 返回 429。前端识别 429/1027，显示“今日额度已用完，X 点恢复”，禁用写操作，保留只读缓存。
- 存储 100%：阻止上传（507/413），保留下载/删除/清空回收站。
- R2/D1 故障：返回可读错误 + 请求 ID；不要静默失败或白屏。
- 离线：现有 OfflineBar 保留；上传队列进入暂停，恢复网络后继续。
- 维护模式：管理员开关，API 返回 503 + 文案；静态页仍可展示说明。

#### A10：可观测性与成本仪表

- 统一请求日志：`requestId`、`userId`、`route`、`status`、`ms`、`d1Queries`、`d1RowsRead`、`d1RowsWritten`、`r2Ops`、`subrequests`、`cpuMs`（能取则取）。
- Workers Logs 免费 200k 事件/天；只记录写操作、错误、慢请求（>500ms）与 10% 读采样，避免打满。
- 管理页展示：存储四分项、用户配额、今日请求/读写（应用内统计）、错误率、p95 延迟；Cloudflare 账户级用量附控制台链接。
- 告警：R2 费用/用量通知（Cloudflare 账单提醒）、健康检查（外部免费监控）、cron 失败日志关键字。
- 请求 ID 返回给前端，错误提示附“错误编号”，便于定位。

### 2.6 成本情景与升级阈值

| 场景 | 存储 | R2 月费（超出 10GB） | Workers | D1 | Access | 合计/月 |
|---|---:|---:|---|---|---|---:|
| 轻量文档 | 8 GB | $0 | Free | Free | Free | **$0** |
| 家庭照片 | 50 GB | 40 × $0.015 = $0.60 | Free | Free | Free | **$0.60** |
| 家庭媒体 | 100 GB | 90 × $0.015 = $1.35 | Free | Free | Free | **$1.35** |
| 重度媒体 | 200 GB | 190 × $0.015 = $2.85 | Free | Free | Free | **$2.85** |
| 1 TB | 1 TB | 1014 × $0.015 ≈ $15.21 | Free | Free | Free | **~$15.21** |
| 200GB + 商业安全 | 200 GB | $2.85 | **$5** | Free | Free | **$7.85** |
| 60 用户 SaaS | 1 TB | ~$15 | Paid 起 | 可能 Paid | **$70**（超 50 用户） | **>$90** |

**如果要求严格 $0（不产生任何费用）**：

- 全局硬上限 10GB（不是每用户 10GB），到 100% 停止上传；回收站/版本/缩略图都计入。
- 版本最多 1 版或关闭；不做服务端 ZIP、不做服务端缩略图；分享密码保持 100k + 限流。
- 接受家庭媒体库装不下：约 2,000 张 5MB 照片，或 50 个 200MB 视频，或 1 万份 1MB 文档。
- 代价：要么定期删除/归档，要么接受 R2 按量计费（50GB 约 $0.60/月）。

> 推荐：**免费版为基线，R2 按量作为唯一可能的付费项**。为了严格 $0 而牺牲数据安全（弱密码哈希）、可恢复性（无版本/备份）或体验（原图当缩略图），不符合“商业级”的目标。

**升级触发条件**：

| 触发 | 升级 | 成本 |
|---|---|---|
| R2 >10GB | R2 按量付费（无需操作） | $0.015/GB/月 |
| 分享密码要 600k PBKDF2 / 单请求 >10ms CPU | Workers Paid | $5/月 |
| 单请求确实需要 >50 子请求（如服务端 ZIP） | Workers Paid（10k 子请求，D1 1k 查询） | $5/月 |
| D1 >5M 读/天 | 先按 A3 优化；仍超则 Workers Paid（25B/月） | $5/月起 |
| >50 用户 | Access 付费 | $7/用户/月 |
| 需要厂商 SLA/支持 | Workers/Access/R2 付费计划 | 按合同 |

> 结论：**家庭规模优先花 $0–3/月买存储，不花 $5 买算力**；只有“商业级密码安全/超大批量/服务端 ZIP”才值得 Workers Paid。

### 2.7 目标架构

```
[浏览器 PWA]
  ├─ 静态资源 ──────────────> Workers Assets（免费不限量）
  ├─ 全局上传管理器（AppShell + IndexedDB 队列）
  │    ├─ 小文件 PUT ───────> Worker ─> R2
  │    └─ 大文件分片 ───────> R2 预签名（分块批量取 URL）
  ├─ API 请求 ─> Worker
  │    ├─ Access JWT 校验（边缘 + Worker 双重）
  │    ├─ requestId / 子请求预算 / 审计中间件
  │    ├─ D1：nodes（邻接表+物化路径）/ versions / shares / audit / uploads / settings / storage_stats
  │    │    └─ 闭包表仅 D9=B 时作为 ACL 读模型，不默认启用
  │    └─ R2：content / thumbs
  ├─ 缩略图：上传时客户端 Canvas/WebP 生成 → R2（免费方案）
  ├─ 预览：GET/HEAD + Range + ETag；图片/视频/PDF/文本/Office 分级加载
  └─ 导出：客户端流式 ZIP（避免服务端 50 子请求限制）

[边缘]
  ├─ Cloudflare Access（SSO，≤50 用户免费）
  ├─ WAF 限流（分享密码，1 条免费规则）
  ├─ HSTS / CSP / 安全响应头（_headers）
  └─ Workers Logs + Cloudflare Web Analytics

[定时]
  ├─ 每 15 分钟：孤儿清扫（≤40）
  ├─ 每小时：遗弃分片（≤20）
  ├─ 每日：回收站 + 版本（各 ≤20）
  └─ 每日：配额校准 / 审计 / 通知
```

**明确不做**：KV/DO/Queues/Hyperdrive（当前规模无收益，KV 写限额还会伤害配额计数）；R2 公共域名（绕过 Access/审计）；Cloudflare Images（付费）；边缘缓存 API（仍计请求）；微服务拆分。

### 2.8 备选方案与否决理由

| 方案 | 否决理由 |
|---|---|
| 下载走 R2 公开域名/长期签名 URL | 绕过 Access 与审计；签名 URL 泄露即长期暴露；省下的 Worker 请求本就不是瓶颈 |
| Cloudflare Images/Image Resizing 做缩略图 | 按转换/存储计费；免费版不可用；客户端生成缩略图零服务端成本 |
| KV 缓存用户/会话 | 免费写 1,000/天，配额计数会频繁失效；D1 单行读成本极低 |
| Durable Objects 做上传会话/限流 | 当前规模过度设计；D1 + 有界 cron 足够 |
| Queues 做异步任务 | Workers Paid 依赖；cron + 任务表可覆盖 |
| 边缘缓存 API 响应省请求 | Workers 在缓存前执行，缓存命中仍计请求；仅静态资源免费 |
| 拆多 Worker/微服务 | 无隔离/团队收益，增加部署与调用复杂度 |
| 换 Postgres/Neon | 失去 D1 绑定与免费额度；迁移成本大于收益 |
| 外部 Auth（Clerk/Auth0） | Access 已免费覆盖 50 用户、SSO、边缘防护；重复建设 |

### 2.9 数据库设计：树模型、闭包表与 D1 约束

> **结论先行**：MStor 1.0 继续用“邻接表 + 物化路径”作为主模型，**不把闭包表作为主存储**。闭包表在“任意祖先查询、权限继承、多父 DAG”上更优雅，但在 D1 Free 上写入放大明显：2 万节点、平均深度 5，闭包表约 12 万行；一次 1,000 节点子树移动约 1 万行写入，而物化路径只需 2 条 `UPDATE`。闭包表保留为 1.x 权限继承的候选读模型，完整设计见 2.9.4。

#### 2.9.1 现状：当前模型不是随手写的

当前 `sql/schema.sql` 的核心设计：

- `nodes.parent_id`：邻接表，列直接子节点。
- `nodes.path`：物化祖先 id 链（不含自身），根 `/`，根子节点 `/{rootId}/`；`path` 只含 id，不含文件名，所以**改名不改变路径**。
- 子树前缀 `path || id || '/'`；用 `(owner_id, path)` 范围扫描替代 `LIKE '%...%'`，避开 SQLite `LIKE` 模式长度上限 50。
- `idx_nodes_listing(owner_id, parent_id, is_dir DESC, name) WHERE deleted_at IS NULL` 覆盖目录列表排序。
- `idx_nodes_name_active` 部分唯一索引保证活跃节点同名冲突，回收站不占名。
- FTS5 trigram 同步文件名；搜索不依赖树。

这对应真实查询模式：

| 操作 | 当前实现 | 复杂度/成本 | 频率 |
|---|---|---|---|
| 列目录 | `parent_id` + 覆盖索引 | O(子节点数)，无排序临时表 | 极高 |
| 面包屑 | `path` 解析 + `id IN (...)` | 1–2 次索引查询 | 高 |
| 子树删除/移动/还原 | `path` 范围 `>= lo AND < hi` | 1 次范围扫描 | 中 |
| 移动目录 | 自身 1 条 UPDATE + 子树 1 条前缀 UPDATE | 2 条语句 | 中 |
| 重命名 | 只改 `name` | 1 条语句，不碰路径 | 高 |
| 搜索 | FTS5 trigram | 与树无关 | 高 |
| 回收站过期 | `deleted_at` 部分索引 | 有界扫描 | 每日 |

结论：物化路径是为“D1 Free + 文件树 + 频繁移动/删除”专门优化过的，不是教科书式的临时方案。

#### 2.9.2 四种树模型对比（按本项目的真实负载）

假设：2 万节点、平均深度 5、最大深度 20；每月移动 200 次、其中 1% 是 1,000 节点子树；D1 Free 每天 10 万行写入。

| 模型 | 子树查询 | 祖先/面包屑 | 移动 1,000 节点子树 | 插入 | 存储 | D1 Free 适配 | 结论 |
|---|---|---|---|---|---|---|---|
| 邻接表 + 递归 CTE | 递归 O(子树) | 递归 O(深度) | O(1) 改父 | O(1) | O(n) | 递归查询行数/CPU 不稳 | 仅作对照 |
| **物化路径（当前）** | 1 次索引范围 | 解析 path + 1 次 IN | **2 条 UPDATE，约 1,000 行** | 读父行 + 1 行 | 约 3.7MB（20k×5×37B） | **最好** | **1.0 主模型** |
| 闭包表 | 1 次索引（+ join） | 1 次索引 | **约 1 万行删除+插入** | 复制父祖先 O(depth) | 约 10MB（120k 行） | 写入放大，导入易撞日限 | 1.x ACL/读模型候选 |
| 嵌套集 | 1 次范围 | 1 次范围 | 重编号 O(n) | 重编号 O(n) | O(n) | 并发写灾难 | 否决 |

补充数字：

- **导入 2 万节点**：物化路径约 2 万行写入；闭包表约 12 万行，超过 D1 Free 单日 10 万行，必须分两天或临时升级 Paid。
- **移动 1,000 节点子树**：物化路径 2 条语句、约 1,000 行；闭包表约 5,000 删除 + 5,000 插入，且需要跨多批，失败恢复更复杂。
- **祖先查询**：物化路径解析 5 个 id + 一次 `IN`，和闭包表一次索引查询同量级；没有明显劣势。
- **权限继承**：物化路径用 `target.path` 前缀判断即可；闭包表更通用，但不是 1.0 必需。

> 因此，**“闭包表更先进”不等于“更适合 D1 Free 文件树”**。闭包表真正的优势是任意深度祖先/后代查询与 DAG/多父模型；MStor 是单父文件树，移动是高频操作，物化路径更合适。

#### 2.9.3 物化路径实现规范（1.0 必须补齐的约束）

**不变量（必须写进测试）**：

1. 根哨兵行：`parent_id=''`、`name=''`、`path='/'`；每个 owner 恰好一行。
2. 根的直接子节点：`path='/{rootId}/'`。
3. 任意节点：`path = parent.path || parent.id || '/'`。
4. 子树前缀：`subtreePrefix = path || id || '/'`；所有后代 `path` 以它开头。
5. `path` 只含 `[0-9a-f-]` 与 `/`；id 为 UUID；用 `/` 分段，禁止字符串 `includes` 判断（防子串误判）。
6. 最大深度 100（路径长度 <4KB）；创建/移动时拒绝更深，避免行膨胀和 UI 递归。
7. 正常读取必须过滤 `deleted_at IS NULL`；恢复/彻底删除用单独的 `getNodeIncludingDeleted`。当前 `getNode` 没有过滤，是数据安全 bug，Phase 1 修。

**核心 SQL**：

```sql
-- 列目录（走 idx_nodes_listing）
SELECT * FROM nodes
WHERE owner_id = ?1 AND parent_id = ?2 AND deleted_at IS NULL
ORDER BY is_dir DESC, name
LIMIT ?3;

-- 面包屑：path 给出祖先 id，再用 IN 查
SELECT * FROM nodes WHERE id IN (?,?,...);

-- 子树（含自身）：范围扫描，走 idx_nodes_path
SELECT id, r2_key FROM nodes
WHERE owner_id = ?1 AND (id = ?2 OR (path >= ?3 AND path < ?4));
-- lo = path || id || '/', hi = lo || 'g'

-- 移动：自身 + 子树前缀平移，同一 D1 batch 原子提交
UPDATE nodes SET parent_id=?1, name=?2, path=?3, updated_at=?4
WHERE id=?5 AND owner_id=?6;

UPDATE nodes SET path=?1 || substr(path, ?2)
WHERE owner_id=?3 AND path >= ?4 AND path < ?5;
-- ?1 = newSelfPath || node.id || '/'
-- ?2 = oldPrefix.length + 1（SQLite substr 1-based）
-- ?4/?5 = oldPrefix / oldPrefix || 'g'
```

**移动的零查询祖先判断**：

```ts
const isSelfOrDescendant =
  targetParentId === dir.id ||
  targetParent.path.split("/").filter(Boolean).includes(dir.id);
```

目标父行已经加载，不需要每目录一次 `isDescendant`（当前 `trash.ts:186-189` 的 N 次查询要删掉）。

**边界规则**：

- 不能移动/删除根哨兵行（`name === ''`）。
- 目标父必须是活跃目录；`resolveParent` 必须过滤 `deleted_at`，不能把回收站目录当有效父。
- 移动目录到自身或后代 → 400；移动文件到自身 → 400。
- 同名冲突在目标父下检查，排除自身；唯一索引兜底并映射 409。
- 还原时若原父已删除：返回 `409 PARENT_DELETED`，提示先恢复父目录；不要静默丢到根。
- 还原同名：在 JS 中分配 `name (2)` 后缀，按批次一次性检查，避免逐项 `uniqueName`。
- 软删除不改变 `path`；彻底删除才移除行。恢复时路径仍有效（前提是父未被删）。
- 目录移动不改变文件内容，不需要改 `content_version`。

**路径漂移修复任务**（每日/每周，低频）：

```sql
SELECT c.id, c.path, p.path AS parent_path, p.id AS parent_id
FROM nodes c JOIN nodes p ON c.parent_id = p.id
WHERE c.name != ''
  AND c.path != (p.path || p.id || '/')
LIMIT 100;
```

发现不一致：记录 `path_invariant_violation` 审计，按父路径重算并批量修正；连续出现说明移动逻辑有 bug，先停写而不是静默修。测试用 2 万节点合成树做属性测试：任意 create/move/rename/delete/restore 后不变量成立。

#### 2.9.4 闭包表完整设计（如果决定采用）

这一节不是“建议现在做”，而是给出**可执行的备选方案**，避免只写一句“可以考虑闭包表”。

**DDL**：

```sql
CREATE TABLE IF NOT EXISTS node_closure (
  owner_id TEXT NOT NULL,
  ancestor_id TEXT NOT NULL,
  descendant_id TEXT NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  PRIMARY KEY (ancestor_id, descendant_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_closure_ancestor
  ON node_closure(owner_id, ancestor_id, depth);
CREATE INDEX IF NOT EXISTS idx_closure_descendant
  ON node_closure(owner_id, descendant_id, depth);
```

每行表示 `ancestor_id` 到 `descendant_id` 的路径，`depth=0` 是自身；根哨兵也建自身行。

**插入节点**（父的祖先 + 自身）：

```sql
INSERT INTO node_closure(owner_id, ancestor_id, descendant_id, depth)
SELECT owner_id, ancestor_id, ?newId, depth + 1
FROM node_closure
WHERE descendant_id = ?parentId
UNION ALL
SELECT ?ownerId, ?newId, ?newId, 0;
```

**移动子树**（把 `?id` 移到 `?newParentId`）：

```sql
-- 1) 删除子树到旧外部祖先的边；子树内部边保留
WITH sub AS (
  SELECT descendant_id, depth FROM node_closure WHERE ancestor_id = ?id
)
DELETE FROM node_closure
WHERE descendant_id IN (SELECT descendant_id FROM sub)
  AND ancestor_id NOT IN (SELECT descendant_id FROM sub);

-- 2) 新祖先 × 子树，深度 = 新祖先深度 + 1 + 子树相对深度
WITH sub AS (
  SELECT descendant_id, depth FROM node_closure WHERE ancestor_id = ?id
),
newanc AS (
  SELECT ancestor_id, depth FROM node_closure WHERE descendant_id = ?newParentId
)
INSERT INTO node_closure(owner_id, ancestor_id, descendant_id, depth)
SELECT ?ownerId, na.ancestor_id, s.descendant_id, na.depth + 1 + s.depth
FROM newanc na CROSS JOIN sub s;
```

> 两条语句必须放在同一 D1 batch；CTE 作用域只覆盖单条语句，不能把 `sub`/`newanc` 跨语句复用。若集群规模大，先用 `closure_moves` 任务表保存 `sub`/`newanc` 快照，再分批执行；不要在失败后留下“旧边已删、新边未写”的中间态。

复杂度：`O(|子树| × |新祖先链|)`；1,000 节点、深度 5 约 5,000–10,000 行写入。必须分批，并在任务表记录进度；失败可重试（先删旧边会破坏中间态，建议用 `closure_moves` 任务表 + 影子表，或先写新边再删旧边并去重）。

**删除**：`DELETE FROM node_closure WHERE descendant_id IN (子树)`；子树内部/外部边一并删除。若用 `ON DELETE CASCADE`，删除 `nodes` 时自动清理，但 D1 batch 仍需按 90 行分片。

**查询**：

```sql
-- 祖先（面包屑，depth 降序）
SELECT n.* FROM node_closure c
JOIN nodes n ON n.id = c.ancestor_id
WHERE c.descendant_id = ?1 AND c.owner_id = ?2
ORDER BY c.depth DESC;

-- 子树（depth > 0）
SELECT n.* FROM node_closure c
JOIN nodes n ON n.id = c.descendant_id
WHERE c.ancestor_id = ?1 AND c.owner_id = ?2 AND c.depth > 0;

-- 环检查：把 target 移入 moving 子树？
SELECT 1 FROM node_closure
WHERE ancestor_id = ?targetParentId AND descendant_id = ?movingId
LIMIT 1;
```

**迁移步骤（若 D9 选闭包表）**：

1. 新增表，不改旧代码；`feature_flags.closure_read=false`。
2. 按 `path` 深度从浅到深回填：每个节点插入自身 + 父的祖先；每批 500 节点/事务，记录 `closure_backfill(node_id)` 进度。
3. 2 万节点、深度 5 约 12 万行；D1 Free 10 万行/天，分 2 天或临时 Workers Paid；不要在一个请求里做。
4. 影子读：同一批请求同时走 path/closure，比较结果；差异写审计。
5. 切换读路径 → 切换写路径（同一 D1 batch 维护）→ 保留 path 作为兼容/回滚；至少观察 2 周。
6. 回滚：`closure_read=false`，写路径保留双写或回退；`DROP TABLE` 只在确认无引用后。

**采用闭包表的触发条件**（满足任一才考虑）：

- 需要“任意节点继承权限”，且权限检查频率高到 path 前缀解析成为瓶颈（当前不是）。
- 引入多父/DAG（例如同一文件出现在多个虚拟目录）——这已经不是当前文件树模型。
- 需要复杂的祖先统计/审计查询，且物化路径的字符串解析不可接受。

否则，**保持 path，避免双写和迁移风险**。

#### 2.9.5 1.0 核心表与索引

完整 DDL 见附录 D；这里只列与树/预览/版本相关的关键变更：

| 表 | 关键列 | 索引/约束 | 说明 |
|---|---|---|---|
| `nodes` | `parent_id`, `path`, `name`, `is_dir`, `r2_key`, `size`, `mime`, `sha256`, `content_version`, `thumb_key`, `width`, `height`, `taken_at`, `deleted_at` | `(owner_id,parent_id,is_dir,name) WHERE deleted_at IS NULL`；`(owner_id,path)`；唯一 `(owner_id,parent_id,name) WHERE deleted_at IS NULL` | `content_version` 每次内容替换 +1，用于 ETag/缓存 |
| `file_versions` | `id`, `node_id`, `version_no`, `r2_key`, `size`, `sha256`, `created_at`, `expires_at` | 唯一 `(node_id,version_no)`；`(node_id,created_at DESC)`；`(expires_at)` | 版本行可共享 `r2_key`；孤儿判定要查此表 |
| `shares` | `token`, `password_hash`, `max_downloads`, `downloads`, `allow_download`, `expires_at`, `revoked_at` | `token UNIQUE`；`(node_id)` | 下载上限用原子 UPDATE |
| `share_downloads` | `share_id`, `ip_hash`, `ua_hash`, `success`, `created_at` | `(share_id,created_at DESC)` | 审计；不记录原始 IP |
| `uploads` | `idempotency_key`, `status`, `r2_upload_id`, `size` | `idempotency_key` 部分唯一 | 重试/刷新不产生双份 |
| `audit_events` | `actor_id`, `action`, `target_type/id`, `request_id`, `ip_hash`, `created_at` | `(created_at DESC)`；`(actor_id,created_at)`；`(action,created_at)` | 追加-only，无更新/删除 API |
| `storage_stats` | `used_bytes`, `active/trash/version/thumb_bytes` | 单行 `id=1` | 原子预算/配额 |
| `node_permissions` | `node_id`, `user_id`, `role` | PK `(node_id,user_id)` | 1.x 内部共享；1.0 不做继承 |

**查询计划门禁**：对下列查询保存 `EXPLAIN QUERY PLAN` 快照，出现 `SCAN nodes`（FTS 虚表除外）即失败：

- 列目录、面包屑、子树、回收站列表、按 sha256 秒传、按 token 查分享、按 `expires_at` 清理版本。

#### 2.9.6 一致性与迁移

- **D1 batch 是原子的**：移动的“自身 + 子树”两条 UPDATE 必须在同一 batch；任何一条失败整体回滚。不要先改自身再异步改子树。
- **没有跨请求事务**：批量删除/还原拆成多个请求时，用幂等语义（目标状态相同即成功）+ `remaining` 游标；失败可重试。
- **软删除/恢复**：唯一索引只覆盖活跃行；恢复冲突分配新名；父目录已删则拒绝并提示。
- **并发移动/删除**：移动前读取 node/parent；batch 内再带 `owner_id` 和 `deleted_at IS NULL` 条件；`meta.changes=0` 视为冲突，返回 409 让客户端刷新。
- **迁移**：只用 expand-contract（加列/加表 → 双写/回填 → 切读 → 清理），不原地重建大表；迁移前 `wrangler d1 time-travel` bookmark；staging 用 2 万节点演练。
- **`content_version` 回填**：存量行默认 1；替换内容时 `content_version=content_version+1`；ETag 使用 `id-content_version`，避免“改名/移动导致缓存全失效”或“内容替换后仍命中旧缓存”。

### 2.10 在线预览与 Range：协议级设计

> 预览的目标不是“能打开”，而是：**大文件不整包下载、视频可拖动、PDF 可按页取、断网可恢复、错误可解释、任何类型都不执行恶意内容**。核心是服务端 HTTP 语义正确，前端只是消费者。

#### 2.10.1 现状与差距

当前实现：

- `server/lib/serve.ts` 已支持单段 `Range`、`206`、`Content-Range`、`Accept-Ranges`、`ETag`、`Content-Disposition`，并把 HTML/SVG/XHTML 强制 `attachment`。
- `PreviewModal.tsx` 已支持图片、视频、音频、PDF（原生 iframe）、文本（前 1MB Range）。
- 但：
  - 没有 `HEAD` 明确处理；没有 `If-Range`/`If-None-Match`/`304`；416 没有 `Content-Range: bytes */size`。
  - 多段 Range 未定义；非法 Range 行为不统一；零字节文件未覆盖。
  - `ETag = node.id`，内容替换/版本后可能命中旧缓存；图片 `immutable` 一年，但 URL 不带版本，替换后仍是旧图。
  - PDF 用原生 iframe，跨浏览器体验不一致；没有 PDF.js/页面导航/文本层。
  - 没有 Office/CSV/JSON 结构化预览；文本没有截断提示/编码处理/大文件虚拟化。
  - 预览弹窗没有 `role="dialog"`/焦点陷阱/焦点恢复；错误态只有一行文字。
  - 分享内容与私有内容共用一套逻辑，下载计数/限流/Range 语义未分离。

#### 2.10.2 HTTP 合约（必须逐条测试）

| 请求 | 期望响应 |
|---|---|
| `GET` 无 Range | `200`，完整流，`Content-Length=size`，`Accept-Ranges: bytes`，`ETag`，`Last-Modified` |
| `GET Range: bytes=0-1023` | `206`，`Content-Range: bytes 0-1023/size`，`Content-Length=1024` |
| `GET Range: bytes=1024-` | `206`，从 1024 到末尾 |
| `GET Range: bytes=-1024` | `206`，最后 1024 字节；`size<1024` 时取全部 |
| `GET Range` 起点 ≥ size | `416`，`Content-Range: bytes */size`，`Accept-Ranges: bytes`，无 body |
| `GET Range` 语法非法/多段 | `200` 完整流（服务器忽略 Range；不要猜） |
| `HEAD` | 忽略 Range（按 RFC 允许），返回 `200` 全量元数据、`Content-Length=size`、无 body；不读 R2 body |
| `If-None-Match` 命中 | `304`，带 `ETag`/`Cache-Control`，无 body |
| `If-Modified-Since` 未修改 | `304`（在无 `If-None-Match` 时生效） |
| `If-Range` 不匹配 | `200` 完整流（不是 206） |
| `Range` + `If-Range` 匹配 | `206` |
| `size=0` | `200`，`Content-Length=0`；任何 Range → `416 bytes */0` |
| 分享过期/撤销/密码错 | `403/404/401`，不泄露对象是否存在 |
| 下载次数用尽 | `410` 或 `429`，带明确错误码，不返回内容 |
| `?v` 与当前 `content_version` 不符 | 若 `file_versions` 仍保留该版本 → `200` 该版本（immutable）；已清理 → `404 VERSION_GONE`。**不要用当前内容冒充旧版本**；版本预览用 `?version=` 显式接口 |

**为什么这些细节重要**：视频拖动、PDF.js、下载管理器、断点续传都依赖 `206 + Content-Range + ETag + If-Range`；少一个，浏览器就会退回整包下载或拖动失败。

#### 2.10.3 服务端实现

**伪代码**：

```ts
const size = node.size ?? 0;
const version = node.content_version ?? 1;
const etag = `"${node.id}-${version}"`;
const lastModified = new Date(node.updated_at).toUTCString();

if (req.headers.get("if-none-match") === etag) {
  return new Response(null, { status: 304, headers: { etag, "cache-control": cacheControl } });
}

const parsed = parseRange(req.headers.get("range"), size);
if (parsed.kind === "unsatisfiable") {
  return new Response(null, {
    status: 416,
    headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes", etag },
  });
}
let range = parsed.kind === "valid" ? parsed : null;

const ifRange = req.headers.get("if-range");
if (range && ifRange && ifRange !== etag && ifRange !== lastModified) range = null;

if (method === "HEAD") {
  const head = await BUCKET.head(node.r2_key);
  if (!head) throw notFound();
  return new Response(null, { status: 200, headers: headersFor(size, null) });
}

const obj = range
  ? await BUCKET.get(node.r2_key, { range: { offset: range.start, length: range.end - range.start + 1 } })
  : await BUCKET.get(node.r2_key);
if (!obj) throw notFound();

return new Response(obj.body, {
  status: range ? 206 : 200,
  headers: headersFor(size, range),
});
```

**`parseRange` 规则**（写成纯函数，表格驱动测试）：

- 只接受单段：`^bytes=(\d*)-(\d*)$`，先 `trim().toLowerCase()`；含 `,` 视为多段 → `none`（回 200）。
- `start=""` 且 `end=""` → `unsatisfiable`。
- 后缀 `bytes=-N`：`N=0` → `unsatisfiable`；`start = max(0, size-N)`，`end=size-1`。
- `start` 存在：`start >= size` → `unsatisfiable`；`end` 缺省 → `size-1`；`end >= size` → 钳制到 `size-1`；`end < start` → `unsatisfiable`。
- `Number.isSafeInteger` 校验；超长数字/`NaN` → `none`。
- `size=0`：任何 Range → `unsatisfiable`。
- 不要用 `split("-")` 后直接 `Number`，会接受空串/负数/指数；用正则 + 显式边界。

**响应头**：

```http
Accept-Ranges: bytes
ETag: "<id>-<contentVersion>"
Last-Modified: <updated_at>
Cache-Control: private, no-cache
Content-Disposition: inline; filename*=UTF-8''...
X-Content-Type-Options: nosniff
Cross-Origin-Resource-Policy: same-origin
Content-Security-Policy: sandbox
```

- 私有内容默认 `private, no-cache` + ETag 304；只有 URL 带 `?v=<contentVersion>` 且匹配时才 `private, max-age=31536000, immutable`。
- 缩略图 key 不可变，可用 `private, max-age=31536000, immutable`；仍带 ETag。
- Range 响应加 `Cache-Control: no-transform`，防止中间层压缩/改写字节范围。
- `Content-Disposition` 的 `filename*` 做 RFC 5987 编码；拒绝 CR/LF/控制字符（名称校验已做）。
- `CSP: sandbox` 对 HTML/SVG/XHTML 必须；PDF/媒体是否加要按浏览器矩阵测试（sandbox 可能影响原生 PDF 插件）。安全优先：**可执行内容一律 attachment + sandbox**；PDF 用 PDF.js 而不是依赖插件。
- 不要对 `video/*`、`audio/*`、`application/zip` 等做压缩；不要给 Range 响应加 `Content-Encoding`。
- **版本解析**：先读 `nodes.content_version`；`?v` 匹配 → 当前对象；不匹配则查 `file_versions` 的 `version_no`，命中 → 该版本对象（只读、immutable），未命中 → `404 VERSION_GONE`。这样旧 URL 不会把“当前内容”错误地缓存成“旧版本”。
- **条件头解析**：`If-None-Match` 可能是 `*` 或逗号分隔列表，要按 RFC 解析（GET 用弱比较）；`If-Range` 只接受强 ETag 或 HTTP-date，弱 ETag 视为不匹配。不要用字符串全等糊弄。

**R2 读取**：

- `HEAD` 用 `BUCKET.head(key)`，不要 `get` 后丢弃 body。
- Range 用 `BUCKET.get(key, { range: { offset, length } })`；`length` 必须由服务端计算，不信任客户端。
- `obj.size` 是全量大小；`Content-Range` 的 `size` 用 node.size（不一致时以 R2 head 为准并告警）。
- 流式返回 `obj.body`，禁止 `arrayBuffer()` 整包读入内存。
- 对象缺失 → 404；node 已删除/无权限 → 404（不区分，防枚举）。

**端点面**：

| 端点 | 方法 | 查询参数 | 说明 |
|---|---|---|---|
| `/api/files/:id/content` | `GET/HEAD` | `dl=1`、`v=<content_version>`、`version=<version_no>` | 私有内容；`version` 需鉴权，只读 |
| `/api/files/:id/thumb` | `GET/HEAD` | `v=<thumb_key>` | 320px WebP；key 不可变 |
| `/api/s/:token/content` | `GET/HEAD` | `dl=1` | 分享内容；密码/过期/上限校验；Range 不计数 |
| `/api/files/:id/versions` | `GET` | 游标 | 版本列表；不返回 R2 key |
| `/api/files/:id/versions/:vid/restore` | `POST` | — | 生成新当前版本，审计 |

前端 `contentUrl()` 改为显式选项（`dl`/`v`/`version`），不再让调用方手拼 query；缩略图用 `thumbUrl(id, thumbKey)`。

#### 2.10.4 预览类型矩阵

| 类型 | MIME | 1.0 方案 | 关键技术 | 限制/降级 |
|---|---|---|---|---|
| 图片 | `image/jpeg/png/webp/avif/gif` | `<img>` + 灯箱缩放 | 缩略图优先、EXIF Orientation、`?v` 缓存 | SVG 只下载；HEIC 不支持则下载 |
| 视频 | `video/mp4/webm` | `<video controls preload=metadata playsInline>` | Range 拖动、海报、`canPlayType` | MOV/HEVC 仅 Safari；MKV 下载 |
| 音频 | `audio/mpeg/aac/ogg/wav/flac` | `<audio controls>` | Range、时长元数据 | 不支持则下载 |
| PDF | `application/pdf` | Phase 1 原生 iframe；Phase 2 PDF.js | Range、worker、cMap、密码 | >100MB 提示下载 |
| 文本/代码 | `text/*`, `application/json` | `<pre>` + 语法高亮 | 前 1MB Range、编码、虚拟化 | >2MB 截断提示 |
| Markdown | `text/markdown` | 渲染 + 消毒 | `react-markdown` + `rehype-sanitize` | 禁 raw HTML/外链图片 |
| CSV/TSV | `text/csv` | 表格预览 | 前 200 行/50 列、虚拟滚动 | 大文件下载 |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Phase 2 客户端渲染 | `docx-preview` + DOMPurify | >20MB 下载 |
| XLSX | `...spreadsheetml.sheet` | Phase 2 客户端表格 | SheetJS，只读、禁宏 | >10MB/5k 行下载 |
| PPTX/旧 Office | `...presentationml...`, `application/msword` | 下载 | 无免费可靠渲染 | 明确提示 |
| ZIP | `application/zip` | 1.x 列目录 | Range 读中央目录 | 1.0 下载 |
| 未知 | `application/octet-stream` | 下载 | — | 不尝试嗅探执行 |

#### 2.10.5 PDF：原生 iframe 与 PDF.js 的选择

- **Phase 1（先可用）**：`<iframe src=contentUrl>` 使用浏览器原生 PDF 查看器；零包体、Range 由浏览器处理。验收：Chrome/Safari/Firefox 能打开、能翻页、能下载；移动端可滚动。
- **Phase 2（商业级一致性）**：`pdfjs-dist` 懒加载：
  - `getDocument({ url, withCredentials: true, rangeChunkSize: 262144, disableAutoFetch: true, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true })`。
  - 只渲染当前页 + 前后各一页；页面导航、缩放、旋转、文本层（可选）。
  - worker 同源：`GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs"`；CSP `worker-src 'self' blob:`。
  - 密码 PDF：弹出密码框，`getDocument({ password })`；不把密码写日志。
  - 关闭时 `pdfDoc.destroy()`、释放 canvas/object URL，避免移动端内存泄漏。
  - 大 PDF：`disableAutoFetch` + 按页 Range；不要一次 `getData()`。
  - 无障碍：工具栏按钮有 `aria-label`；页面 canvas 提供页码/总页数；文本层可选中（若开启）。
- **CSP 注意**：PDF.js 可能使用 `blob:` worker；`script-src` 是否要 `wasm-unsafe-eval` 取决于构建（JPEG2000 解码）；用真实构建做 CSP 回归，不要凭猜。

#### 2.10.6 视频/音频：Range 是生命线

- `<video>` 不要用 `fetch`/Blob 预下载；直接 `src=contentUrl`，让浏览器发 Range。
- `preload="metadata"` 只取头部；`poster=thumbUrl`；`playsInline` 兼容 iOS。
- 服务端必须正确返回 206/416；否则 Safari/Chrome 的 seek 会失败或整包下载。
- 编码矩阵：MP4/H.264/AAC 最稳；WebM/VP9 次之；MOV/HEVC 仅 Safari；MKV 多数浏览器不支持。前端 `canPlayType` 检测，失败显示“浏览器不支持此编码，请下载或转码后播放”。
- 不做服务端转码（免费版 CPU 不允许）；上传时提示推荐 MP4/H.264。
- 字幕 1.x：同目录同名 `.vtt`，`<track kind="captions">`；注意跨目录/权限。
- 分享视频：Range 请求不重复计下载次数；只对 `dl=1` 首次完整下载计数（见 2.11）。

#### 2.10.7 图片/缩略图

- 网格视图只加载 `/api/files/:id/thumb`（320px WebP），不要用原图；`loading="lazy"`、`decoding="async"`、固定 `width/height` 防 CLS。
- 缩略图上传：客户端 Canvas 生成，按 EXIF Orientation 纠正，`image/webp` q≈0.8；HEIC/RAW 解码失败回退图标，不阻塞上传。
- 灯箱：原图 `<img>` + 缩放/平移/旋转/重置；键盘 `+/-/0`、方向键；移动端双指缩放/双击；关闭释放 object URL。
- SVG 不作为图片内联预览（可含脚本/外链）；强制下载或显示图标。
- 缓存：缩略图 key 不可变，`immutable`；原图用 `?v=contentVersion`，替换后 URL 变化。

#### 2.10.8 文本/结构化数据

- 文本预览用 Range 取头部 1MB；通过 `Content-Range` 判断是否截断，UI 明示“仅显示前 1MB，下载查看全部”。
- 日志可提供“看结尾”`bytes=-1048576`；服务端已支持后缀 Range。
- 编码：UTF-8 优先；BOM 处理；非法字节用替换字符，不抛异常；可选 GBK 检测（1.x）。
- 代码高亮懒加载（Shiki/Prism），只对 ≤1MB 文本；超过则纯文本 + 虚拟滚动。
- Markdown：`react-markdown` + `rehype-sanitize`，禁用 raw HTML、`javascript:` 链接、外链图片；外链点击提示离开。
- JSON：解析失败显示原文；成功则格式化，限制节点数。
- CSV：只解析前 200 行/50 列；表头固定、虚拟滚动；不执行公式。
- 不允许把文本当 HTML `innerHTML` 渲染。

#### 2.10.9 Office（Phase 2，客户端渲染）

- DOCX：`docx-preview` 渲染到容器，输出经 DOMPurify；禁外链图片/字体；>20MB 降级下载。
- XLSX：SheetJS 只读解析，取第一个 sheet，限制 5,000 行/50 列；不执行宏/公式；表格虚拟化、可复制。
- PPTX/旧 `.doc/.xls/.ppt`：1.0 不做；明确“下载后查看”，不要给假预览。
- 隐私：全部在浏览器解析，不上传第三方；CSP 限制 `connect-src`，防止文档外链回传。
- 安全：宏永不执行；渲染容器 `sandbox`/无脚本；文档内超链接只显示不自动打开。

#### 2.10.10 预览 UI/UX 与可访问性

当前 `PreviewModal` 只有 Escape 和点击遮罩，缺少：

- `role="dialog" aria-modal="true" aria-labelledby`；打开时焦点移入，Tab 循环，关闭恢复触发元素。
- 背景 `inert`/滚动锁；`Esc` 关闭；移动端下滑关闭（可选，避免与缩放冲突）。
- 工具栏：文件名、大小、下载、缩放/旋转（图片）、页码（PDF）、关闭；按钮 ≥44px 且有 `aria-label`。
- 加载态：图片/视频骨架；PDF 进度；文本 loading；错误态“原因 + 重试 + 下载”。
- 键盘：`+/-/0` 缩放，方向键翻页/切换，`f` 全屏，`Esc` 关闭；焦点不落到背景。
- 屏幕阅读器：打开时播报文件名/类型；媒体用原生控件；PDF 当前页/总页数可读。
- 减少动效：`prefers-reduced-motion` 下取消进场动画。
- 分享页预览：无下载权限时隐藏下载按钮，但不要假装能阻止截图（文案诚实）。

#### 2.10.11 性能与成本

- 一次普通预览：鉴权 D1 + 节点 D1 + R2 GET ≈ **3 子请求**；Range 不增加额外 D1。
- 100 张图片网格：100 个缩略图请求；虚拟列表 + `loading=lazy` 只加载可视区；家庭用量仍远低于 10 万/天。
- 视频 seek：每次 1 个 Range 请求；一部 1GB 视频可能 10–50 次，家庭可接受；分享页加 IP 限流防滥用。
- PDF.js：首屏 1–3 个 Range；`disableAutoFetch` 防止一次拉全量；按页渲染。
- 前端按需加载：PDF.js/Office/语法高亮各自独立 chunk；首屏 JS 预算 ≤250KB gzip。
- Service Worker 只缓存 shell/静态库，不缓存私有媒体；Range 请求绕过 SW，避免把 206 缓存成完整对象。
- 指标：预览打开 p95、首字节 p95、206 比例、416 率、R2 Class B、每用户预览请求数。

#### 2.10.12 预览测试矩阵

- **纯函数**：Range 解析 20+ 用例（前后缀、越界、零字节、多段、非法数字、大小写/空格）。
- **Miniflare 集成**：写入已知字节对象，逐个 Range 请求比对 `sha256`；校验 206/416/304 头；HEAD 无 body。
- **浏览器**：Chrome/Safari/Firefox + iOS Safari/Android Chrome；MP4 seek、PDF 翻页、图片缩放、文本截断、下载。
- **安全**：HTML/SVG 上传后必须 attachment；`Content-Type` 伪造不执行；文件名 CRLF 注入；分享 token 枚举。
- **可访问性**：axe 0 critical/serious；键盘-only 打开/关闭/缩放/翻页；焦点恢复。
- **成本**：记录每次预览的 D1/R2/子请求；100 图网格、1GB 视频 seek、50MB PDF 各一组。
- **回归**：`curl -H "Range: bytes=..."` 脚本纳入 CI/staging smoke。

### 2.11 其余关键链路（对应“……”）

| 链路 | 设计要点 | 验收 |
|---|---|---|
| **上传/断点续传** | 状态机 `init → presign → PUT parts → complete`；`Idempotency-Key`；16–32 个预签名/请求；part ETag 校验；失败续传只补缺失分片；配额预扣/释放 | 1GB 上传 ~5–7 个 Worker 请求；断网重连续传；重复 init/complete 不产生双份 |
| **上传秒传/去重** | 仅同 owner、同 size、同 sha256 复用；hash 在 Web Worker 计算，>64MB 可跳过；R2 对象引用计数/孤儿延迟清理 | 秒传命中不新增 R2 字节；删除一个副本不影响另一个；孤儿不误删 |
| **分享/下载** | token 128-bit；密码 100k + 限流；`max_downloads` 原子 UPDATE；Range/预览不计数；`dl=1` 首次计数；Access Bypass 仅精确路径 | 隐身窗口全链路可达；拖动进度条不耗尽次数；撤销立即失效 |
| **搜索** | 1–2 字符前缀 `LIKE 'q%' LIMIT 20`；≥3 字符 FTS5 trigram；类型/时间/大小过滤走索引；游标分页 | 2 万节点短搜索 ≤200 行/查询；`EXPLAIN` 无全表扫；空结果有建议 |
| **权限/ACL** | 1.0 owner/admin/share；1.x `node_permissions` + path 前缀继承；若采用闭包表见 2.9.4；所有批量操作逐项鉴权 | IDOR 负例全过；分享 token 不能读其他节点；代登录审计 |
| **版本** | 内容替换 copy-on-write 到 `file_versions`；文档默认 3 版/30 天、媒体 1 版；版本行计入配额；恢复生成新当前版本 | 替换后可回滚；过期清理有界；版本对象不被孤儿清扫误删 |
| **缓存** | `content_version` 生成 `?v`；ETag/304；缩略图 immutable；私有内容不进公共缓存；SW 只缓存 shell | 重复预览 304；替换后不显示旧图；分享撤销后缓存不继续提供 |
| **一致性/可观测** | D1 batch 原子；幂等键；`requestId`；子请求/CPU/R2 计数；审计与 mutation 同 batch | 失败可重试；日志能还原一次操作；预算超限有 503/告警 |

> 这些链路和 §2.9/§2.10 是同一套约束：**单次 ≤40 子请求、集合式 SQL、流式 I/O、原子计数、可回滚迁移**。不是四套独立方案。

#### 2.11.1 上传状态机与断点续传

```text
queued → init(pending) → uploading parts → completing → done
                    ↘ paused/error → resume（只补缺失分片）
                    ↘ aborted（释放配额/中止 multipart）
```

- `uploads.status` 从 `pending|done` 扩为 `pending|completing|done|aborted`；`idempotency_key` 唯一（owner 维度），重复 init 返回同一会话。
- init：校验父目录/名称/大小/配额；预留字节；创建 R2 multipart；返回 `uploadId`、`key`、`partSize`、首批预签名 URL。
- 客户端每片 PUT 直传 R2，记录 `{partNumber, etag}` 到 IndexedDB；刷新后从本地恢复，服务端 `GET /api/uploads/:id` 返回会话状态（可选 ListParts 做跨设备恢复）。
- complete：提交 `{partNumber, etag}`；服务端调用 R2 complete；`HeadObject` 校验实际大小；插入节点；确认配额；删除会话。任何一步失败保留会话，允许重试。
- 大小/ETag 不匹配 → 400；重复 complete → 幂等返回已有节点；超过 7 天未完成 → R2 自动中止 + cron 清会话。
- 配额：init 预扣 `size`，abort/失败释放，complete 确认；并发上传不能穿透。
- 测试：每个状态断网/刷新/重复请求；分片乱序/缺片/错 ETag；1GB 文件端到端。

#### 2.11.2 分享下载：原子上限与计数口径

```sql
UPDATE shares
SET downloads = downloads + 1, last_download_at = ?1
WHERE id = ?2
  AND revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at > ?1)
  AND (max_downloads IS NULL OR downloads < max_downloads);
-- meta.changes = 0 → 410/429，不返回内容
```

- 只在 `dl=1` 的“下载意图”计数；`Range`/预览/HEAD 不计。同一 `share_id + ip_hash + ua_hash` 10 分钟内只计一次（`share_downloads.dedupe_key` 唯一），避免拖动进度条/下载管理器多请求耗尽次数。
- 密码：PBKDF2 100k + 常量时间比较；单 IP 10 秒限流 + 单分享 10 次失败/小时锁定；密码最少 8 位。
- 撤销/过期在每次内容请求时校验，不能只靠前端；分享内容 `Cache-Control: private, no-store`（或极短 max-age），撤销立即生效。
- Access Bypass 仅 `/s`、`/s/*`、`/api/s/*`、`/api/health`；匿名链路验收见 B3。

#### 2.11.3 搜索：短查询不走 `%q%`

- 1–2 字符：`name LIKE ? || '%'`（前缀）+ `LIMIT 20`，提示“前缀匹配；输入 3 个字符可全文搜索”；需要 `(owner_id, name)` 部分索引。
- ≥3 字符：FTS5 trigram `MATCH`，`LIMIT 100` + 游标；排序 `bm25`，结果高亮 `snippet()`。
- 输入清洗：长度 ≤100；转义 `%`/`_`；不要把用户输入拼进 FTS 语法（用参数/短语）；空查询返回最近/收藏，不扫全表。
- 过滤：类型/时间/大小/是否分享走索引；避免 `OR` 导致全表扫描；必要时拆查询再合并。
- 成本：2 万节点、100 次短搜索/天，目标 ≤200 行/查询；`EXPLAIN QUERY PLAN` 快照门禁。

#### 2.11.4 版本：copy-on-write，不做原地覆盖

- 替换文件 → 新 R2 key + 新 `file_versions` 行（`version_no = max+1`），旧 key 保留；`nodes.r2_key` 指向新对象，`content_version++`。
- 版本对象与当前对象共享 key 时只存一份；配额按逻辑大小计；孤儿判定必须查 `nodes.r2_key`、`file_versions.r2_key`、`nodes.thumb_key`。
- 保留：文档默认 3 版/30 天，媒体 1 版；`expires_at` 由策略计算；cron 有界清理 + 孤儿延迟删除。
- 恢复版本：把旧版本内容复制/提升为新当前版本（生成新版本行），不删除历史；审计记录 `version_restore`。
- 删除节点：`file_versions` 级联/批量删除；对象 key 进入 orphan 队列，宽限期后二次引用检查。
- 测试：连续替换 10 次、并发替换、版本过期、恢复、删除后孤儿不误删。

#### 2.11.5 权限：1.0 简单，1.x 可继承

- 1.0：owner 隔离 + admin 代登录 + share token；所有查询带 `owner_id`，share 只映射到授权节点，不能拿 token 查其他 id。
- 1.x：`node_permissions(node_id,user_id,role)`；检查目标节点及其祖先（物化路径 `target.path` 分段或 §2.9.4 闭包查询），取最高权限；拒绝默认。
- 批量操作逐项鉴权，不能只校验第一个 id；移动/复制要同时校验源与目标；分享创建要校验可读。
- 审计：`share_create/revoke`、`permission_grant/revoke`、`admin_act_as`、`download`。
- 测试：IDOR 矩阵（owner/member/admin/分享/禁用用户 × 读/写/删/分享）。

#### 2.11.6 缓存与 Service Worker

| 资源 | Cache-Control | 说明 |
|---|---|---|
| 静态 shell/JS/CSS | `public, max-age=31536000, immutable`（带 hash） | 构建产物文件名 hash；SW 缓存 |
| 缩略图 | `private, max-age=31536000, immutable` | key 不可变；仍带 ETag |
| 私有原图/媒体 | `private, no-cache`，ETag 304 | URL 带 `?v` 且匹配时可 immutable |
| 分享内容 | `private, no-store` 或短 max-age | 撤销立即生效，不能公共缓存 |
| API JSON | `no-store` | 权限/配额实时性 |

- `contentUrl(id, dl)` 生成 `?v=content_version`；服务端 ETag 用 `"id-version"`；版本不匹配回当前内容。
- Service Worker 只缓存 shell/静态库；**不要缓存私有媒体/Range 响应**；视频/PDF 请求绕过 SW。
- 撤销分享后不能依赖 CDN 缓存清除；用 `no-store`/短 TTL，避免“撤销后还能看”。

## 3. 第二部分：商业级功能设计

### 3.1 产品定位与能力分层

**定位**：面向家庭/亲友/小团队的私有云盘，免费版承载 5–20 人、数万文件、约 10–100GB；以“数据可信、分享可控、体验专业”为商业级标准，而不是做第二个 Google Drive。

**能力分三层**：

1. **信任底座（1.0 必须全部具备）**：存储治理、全局上传、分享治理、审计日志、备份恢复、版本、权限、错误恢复、安全响应头、无障碍基线。
2. **日常效率（1.0 核心 + 1.x 增强）**：搜索/分页、收藏/最近/标签、缩略图/时间线、复制/撤销、通知、管理台。
3. **生态与规模化（1.x 以后）**：内部成员共享、API Token/WebDAV、邮件通知、相册、评论、AI/OCR、桌面同步。

**商业级 1.0 的定义**：一个陌生管理员在无人指导下，能完成“邀请成员 → 设置配额 → 上传 → 分享 → 审计 → 恢复误删 → 导出数据 → 灾备演练”的完整闭环，且核心流程通过 WCAG 2.2 AA 与性能预算。

### 3.2 能力矩阵（现状 → 1.0 目标）

| 域 | 现状 | 1.0 目标 | 优先级 |
|---|---|---|---|
| 身份/访问 | Access SSO、admin/member、停用、续期 | 最后活跃、会话审计、IdP 2FA 说明、成员引导 | P1 |
| 存储治理 | 单用户配额、`used_bytes` | **全局预算、物理占用、回收站/版本计量、成本仪表、告警** | **P0** |
| 上传 | 小文件/分片、续传、进度/速度 | **全局队列、跨页面/刷新恢复、冲突策略、幂等、校验、哈希 Worker** | **P0** |
| 文件操作 | 建/改名/移动/删除/还原/彻底删 | **复制、撤销、批量失败明细、版本** | **P0/P1** |
| 分享 | Token、密码、过期、QR、下载计数 | **下载上限、一次性、下载审计、限流、落地页、内部共享（1.x）** | **P0** |
| 发现 | FTS/LIKE、面包屑、客户端过滤 | **服务端过滤、分页、高亮、收藏、最近、标签** | **P0/P1** |
| 媒体 | 预览弹窗、原图当缩略图 | **客户端缩略图、时间线、EXIF、灯箱手势、视频续播** | **P1** |
| 管理 | 用户/配额/设置/代登录 | **用量仪表、审计、公告、健康、维护模式** | **P0/P1** |
| 运维 | 日志、健康检查、迁移、每日 cron | **staging、SLO、告警、备份/恢复演练、runbook** | **P0** |
| 安全 | Access、JWT、CSRF、下载沙箱 CSP | **应用 CSP/HSTS、WAF 限流、ASVS L2、依赖扫描、威胁模型** | **P0** |
| 合规 | 无 | **隐私/条款、导出/删号、保留策略、security.txt** | **P1** |
| 体验 | 骨架/空态/离线/暗色/减少动效/键盘/44px | **弹窗焦点、WCAG AA、代码分割、RUM、移动手势、i18n** | **P0/P1** |

### 3.3 商业级 1.0：P0 功能规格

#### B1 存储治理与成本中心

- **价值**：避免“免费额度悄悄超、账单突然来”；让管理员知道钱花在哪。
- **行为**：
  - 全局预算（默认 10GB，可配置）+ 单用户配额（默认 10GiB，可调）；上传前双重校验。
  - 占用拆分为活跃/回收站/版本/缩略图；回收站显示“30 天后释放 X GB”。
  - 80% 警告、95% 严重警告、100% 阻止上传；管理员可一键清空回收站/调整预算。
  - 管理页显示“按当前增速，本月预计 R2 费用”；附 Cloudflare 账单提醒链接。
- **数据/API**：`storage_stats` 单行原子计数；`GET /api/me/storage`、`GET /api/admin/storage`、`PATCH /api/admin/settings`；上传预检 `assertStorageBudget`。
- **免费版成本**：每次上传多 1 次 D1 读/写；可忽略。
- **验收**：并发 10 个上传不能突破全局预算；回收站/版本计量准确；100% 时上传被 507 拒绝且文案可操作。

#### B2 全局上传中心

- **价值**：上传是云盘最高频、最易丢工作的一步；当前队列绑定在 `Browser` 页面（`Browser.tsx:44,445`），离开页面就失去控制。
- **行为**：
  - 队列提升到 AppShell 级 Context/Store；路由切换不丢；右下角全局进度浮层；可展开查看每个文件。
  - 队列元数据持久化到 IndexedDB（名称、大小、父目录、分片进度、状态）；刷新后提示“恢复未完成上传”。
  - 暂停/继续/取消全部、重试失败、失败原因可读；完成后汇总“成功 N / 失败 M”，失败项一键重试。
  - 冲突策略：默认“保留两者并自动改名”，明确提示新名称；可选跳过/覆盖（覆盖走新版本，见 B6）。
  - 秒传哈希在 Web Worker 中计算；>64MB 文件不阻塞开始上传（先传，后算，或跳过秒传）。
  - 上传 init 带幂等键；网络重试/刷新恢复不产生双份节点。
  - XHR 401 调用 `handleSessionExpired()`，续期后重试一次，而不是直接失败。
- **数据/API**：队列状态仅客户端；`POST /api/uploads` 增加 `idempotencyKey`；小文件 `PUT /api/files/upload` 也带 `Idempotency-Key`（服务端保存 key→node 24h，重复请求返回同一节点）；`/part-urls` 分块批量；complete 校验实际大小/哈希。
- **免费版成本**：每文件 1–4 次请求；分块预签名把 1GB 从 66 个 Worker 请求降到约 5–7 个（64 个分片 PUT 直传 R2，不经过 Worker）。
- **验收**：上传中切换到设置/回收站，进度仍可见；刷新后能恢复；100 个文件上传失败可重试；无重复节点。

#### B3 分享治理 2.0

- **价值**：分享链接是唯一对外暴露面；商业级必须可限、可查、可撤。
- **行为**：
  - 保留：随机 Token、密码、过期、QR、文件夹分享、下载计数。
  - 新增：最大下载次数（原子扣减）、一次性链接、仅预览/允许下载、过期预设（1h/1d/7d/30d/永久）、复制反馈、撤销全部、分享落地页（文件名/大小/预览/下载按钮）。
  - 密码尝试：WAF 1 条限流规则（10s/IP）+ 服务端失败计数/审计；连续失败锁定 15 分钟，单分享 10 次失败/小时锁定 1 小时（防分布式换 IP 爆破）。
  - 密码策略：最少 8 位，前后端都校验；提示不要复用重要账号密码；不强制复杂字符（长度优先）。
  - 下载审计：时间、分享 ID、IP 哈希、UA 哈希、是否成功；不做用户追踪。
  - **计数口径**：仅对 `dl=1`/完整下载计一次；Range/预览不计数；同一 IP+UA 10 分钟内去重，避免一个视频拖动进度条就耗尽“最大下载次数”。
  - “仅预览”是产品约束，不是 DRM；不能阻止截图/开发者工具另存，文案不要过度承诺。
- **数据/API**：`shares` 增加 `max_downloads`、`allow_download`、`last_download_at`；新增 `share_downloads`；`PATCH /api/shares/:id`；下载时 `UPDATE ... WHERE downloads < max_downloads` 原子判断。
- **Access 例外与匿名链路**：公开分享依赖 Access Bypass（`/s`、`/s/*`、`/api/s/*`、`/api/health`，见 README）；只允许精确路径，**不得整体放行 `/api/*`**；公开路由独立限流/审计；`/api/health` 只返回最小状态，不泄露 D1/R2 细节。
- **验收补充**：用隐身窗口打开 `/s/:token`，确认 HTML → JS/CSS → 缩略图 → 下载全链路匿名可达；若 Access 拦截 `/assets/*`，精确放行静态资源或改用独立分享域名。
- **免费版成本**：每次下载多 1 次 D1 更新；可忽略。
- **验收**：并发 20 次下载，实际成功数不超过上限；撤销后立即 410；过期/密码错误文案不泄露文件信息；审计可查。

#### B4 审计日志

- **价值**：商业级的“谁在什么时候做了什么”；误删、误分享、代登录、配额调整都可追溯。
- **行为**：
  - 记录：登录/失败、上传、改名、移动、复制、删除、还原、彻底删除、分享创建/撤销/下载/密码失败、配额/角色/设置变更、代登录。
  - 字段：`id, actor_id, action, target_type, target_id, metadata_json, request_id, ip_hash, ua_hash, created_at`。
  - 追加-only：无更新/删除 API；管理员按人/动作/时间过滤、分页、CSV 导出。
  - 保留 180 天（可配置）；每日清理任务；IP/UA 只存哈希（HMAC 密钥）。
  - 关键写操作与业务变更放在同一个 D1 batch/事务中，避免“操作成功但没审计”。
- **数据/API**：`audit_events` + 索引；`GET /api/admin/audit`；导出流式 CSV（≤10k 行，CPU 安全）。
- **免费版成本**：家庭每天 <100 条，D1 存储可忽略。
- **验收**：所有 mutation 100% 有事件；管理员无法删除/修改事件；普通成员不可见；导出不含明文 IP。

#### B5 备份、恢复与导出

- **价值**：商业级的底线是“丢了能回来”，而不是“R2 有 11 个 9 的持久性”。
- **行为**：
  - D1：依赖 Time Travel 7 天（Free）；迁移前创建 bookmark；提供一键恢复 runbook（含命令、验证、回滚）。
  - 每日自动导出：GitHub Actions 调 `wrangler d1 export`，加密后存 30 天；导出失败告警。
  - R2：对象不做二次全量备份（成本翻倍）；依靠不可变对象 + 软删除 + 版本 + 孤儿宽限期；提供完整性抽查（按 sha256 抽样下载校验）。
  - 账户导出：客户端流式 ZIP（store-only）逐个拉取内容，避免服务端 50 子请求；导出清单含 metadata/checksum。
  - 删除账户：先软删除，30 天宽限后彻底清理 D1/R2/审计（审计保留最小化）。
- **SLO**：RPO ≤24h（D1 元数据；对象删除有 30 天回收站）；RTO ≤4h；每季度演练一次。
- **验收**：从 Time Travel 恢复到一个新库并跑通登录/列表/下载；1GB/500 文件导出成功；演练记录归档。

#### B6 文件版本

- **价值**：覆盖/误改可回退；商业级云盘的默认预期。
- **行为**：
  - 同名上传或“上传新版本”时保留旧对象；每个节点最多 3 个版本 / 30 天（可配置）；视频等大文件默认只保留 1 个旧版本，避免吃满 10GB。
  - 版本列表：时间、大小、上传者、下载、恢复；恢复生成新版本（不删除历史）。
  - 版本占用计入存储；过期清理任务；删除节点时版本一并进入回收站/彻底删除。
  - 秒传/版本可共享 R2 对象（同 sha256），引用计数避免误删。
  - 不原地覆盖：`file_versions.version_no` 递增，`nodes.content_version` 同步递增（ETag/缓存）；版本预览走 `?version=`，不能拿旧 URL 冒充新内容。
- **数据/API**：`file_versions`；`GET /api/files/:id/versions`、`POST /api/files/:id/versions/:vid/restore`；上传接口支持 `replaceNodeId`。
- **免费版成本**：版本是存储成本，不是请求成本；默认策略必须保守。
- **验收**：覆盖后旧版本可下载/恢复；配额显示版本占用；清理后对象真正释放；并发恢复不产生孤儿。

#### B7 收藏、最近与标签

- **价值**：文件一多，“找得到”比“存得下”更重要；收藏/最近是云盘基线。
- **行为**：
  - 收藏：文件/文件夹一键星标；侧栏“收藏”跨目录聚合。
  - 最近：按最近访问/修改聚合；访问记录节流（同一节点 5 分钟内只写一次），避免 D1 写放大。
  - 标签：所有者维度、颜色、批量打标、与搜索过滤组合；标签不参与权限。
  - 空状态与引导；移动端长按可达。
- **数据/API**：`favorites(user_id,node_id)`、`node_views(user_id,node_id,viewed_at)`、`tags`、`node_tags`；`GET /api/me/favorites|recent`、`POST/DELETE /api/nodes/:id/favorite`、`GET/POST /api/tags`。
- **免费版成本**：收藏 1 行写；最近访问节流后每天 <100 行写。
- **验收**：收藏跨设备一致；最近列表 20 条；标签过滤与搜索组合正确；无 N+1。

#### B8 搜索 2.0 与分页

- **价值**：当前搜索只有 50 条、无过滤/分页/高亮；大库不可用。
- **行为**：
  - ≥3 字符 FTS5 trigram；1–2 字符前缀匹配 + 提示；空查询显示最近搜索。
  - 服务端过滤：类型、大小区间、修改时间、所在目录、是否分享；排序（相关度/时间/名称/大小）。
  - 游标分页（50/页）；结果高亮；键盘上下选择、Enter 打开、Esc 关闭。
  - 保存搜索（1.x 可放 localStorage；跨设备再入库）。
  - 搜索框防抖 300ms、取消过期请求、显示加载态。
- **数据/API**：`GET /api/search?q=&type=&from=&to=&min=&max=&cursor=&limit=`；FTS + 过滤索引；`snippet()` 或客户端高亮。
- **免费版成本**：FTS 查询行读可控；禁止 `%q%`；每页 50。
- **验收**：2 万节点 p95 <500ms；单次查询行读 <5,000；无 `SCAN nodes`；键盘/读屏可用。

#### B9 复制、撤销与批量体验

- **价值**：移动/删除之外的日常操作；商业级要对“手滑”有恢复路径。
- **行为**：
  - 复制文件/文件夹（子树）；复制可共享 R2 对象（同 key）以减少 Class A 与存储，配额按逻辑大小计。
  - 撤销：删除后 8 秒 Snackbar“已移至回收站 · 撤销”；移动/改名提供 30 秒内撤销（操作日志记录旧父/旧名）。
  - 批量：选择计数条、全选当前页、Shift 连选；进度、取消、失败明细与重试；部分成功不整批回滚。
  - 批量接口返回 `{ processed, failed:[{id,code}], remaining }`。
- **数据/API**：`operations`（短期撤销记录，TTL 30s）或复用 `audit_events` 存 undo payload；`POST /api/files/:id/copy`；批量接口统一返回结构。
- **免费版成本**：复制共享对象 0 字节新增；撤销 1–2 次写。
- **验收**：100 项删除可一键撤销；复制 1GB 文件夹不重复占 R2；失败项可单独重试。

#### B10 管理控制台

- **价值**：从“能用”到“可运营”。
- **行为**：
  - 用户：列表、角色、配额、已用、最后活跃、停用/启用、代登录（审计）。
  - 存储：四分项、按用户、按类型、趋势、预计费用。
  - 设置：全局预算、默认配额、回收站/版本保留、上传上限、分享默认值、公告、维护模式。
  - 审计：过滤/分页/导出；健康：`/api/health`、cron 最近运行、错误率。
- **数据/API**：复用 users/settings/audit/storage；`GET /api/admin/overview` 单次聚合（避免 N+1）。
- **免费版成本**：按需查询，无轮询；一次页面加载 3–5 次请求。
- **验收**：管理员 3 分钟内完成“查用量→调配额→看审计”；所有变更写审计；普通成员访问 403。

#### B11 通知中心

- **价值**：配额、分享过期、回收站到期等事件不能只靠用户想起来。
- **行为**：
  - 站内铃铛 + 未读数；类型：存储 80/95/100%、分享即将过期、分享被下载（可选）、回收站即将清空、版本即将过期。
  - 去重键（类型+对象+窗口）避免重复；已读/全部已读；偏好开关。
  - 邮件（1.x）：Cloudflare Email Routing 免费；每日摘要，避免每事件一封。
- **数据/API**：`notifications(id,user_id,type,dedupe_key,payload,read_at,created_at)`；cron 生成；`GET/PATCH /api/notifications`。
- **免费版成本**：每天 <20 行写。
- **验收**：同一事件 24h 内不重复；未读数准确；读屏可播报。

#### B12 数据模型增量

> 树模型与查询计划见 §2.9；1.0 默认物化路径，不建闭包表。以下只列增量表/列。

| 表/列 | 用途 | 备注 |
|---|---|---|
| `file_versions` | 版本历史 | `node_id, version_no, r2_key, size, sha256, created_by, created_at, expires_at`；唯一 `(node_id, version_no)`；索引 `(node_id, created_at)`、`(r2_key)` |
| `audit_events` | 审计 | 追加-only；索引 `(created_at)`、`(actor_id, created_at)`、`(action, created_at)` |
| `favorites` | 收藏 | PK `(user_id, node_id)` |
| `node_views` | 最近访问 | PK `(user_id, node_id)`，`viewed_at`；节流 upsert |
| `tags` / `node_tags` | 标签 | 所有者维度；`UNIQUE(owner_id,name)` |
| `share_downloads` | 下载审计 | `share_id, ip_hash, ua_hash, dedupe_key, success, created_at`；唯一 `(share_id,dedupe_key)` |
| `notifications` | 通知 | `dedupe_key UNIQUE` |
| `storage_stats` | 全局物理占用 | 单行原子计数 |
| `api_tokens` | 1.x API/WebDAV | `token_hash, scopes, last_used_at, revoked_at` |
| `nodes.thumb_key/width/height/taken_at/content_version` | 缩略图/布局稳定性/时间线/缓存版本 | 可空或默认 1；迁移增量 |
| `shares.max_downloads/allow_download/last_download_at` | 分享治理 | 可空/默认值 |
| `uploads.idempotency_key` | 幂等 | 唯一索引（可空） |
| 索引 | 搜索/分页/审计 | `nodes(owner_id,name)`、`nodes(owner_id,taken_at)`、`audit_events(created_at)` 等 |

**迁移策略**：全部增量、可空、expand-contract；迁移前 `wrangler d1 time-travel` bookmark；先写双读旧、再切读、最后清理；每个迁移可回滚；大表变更避免锁表（D1 SQLite 需短事务）。**若 D9 改选闭包表**，按 §2.9.4 的影子读/回填/切换步骤执行，不要直接改主模型。

### 3.4 1.x 差异化能力

| 能力 | 价值 | 免费版可行性 | 建议 |
|---|---|---|---|
| 内部成员共享（按用户/权限） | 家庭内“共享给我”，比公开链接更安全 | 可行；需 `node_permissions` 与权限中间件 | 1.x 优先 |
| API Token + WebDAV | NAS/移动端/自动化挂载 | 需独立主机名/路径 + Token 认证；PROPFIND 查询重 | 1.x，先只读 |
| 邮件通知 | 配额/分享过期提醒 | Email Routing 免费 | 1.x |
| 相册/时间线/EXIF | 家庭照片核心体验 | 客户端 EXIF + 缩略图；D1 只存 taken_at | 1.0 后段 |
| 评论/批注 | 家庭协作 | 可行但非刚需 | 1.x |
| 客户端流式 ZIP 导出 | 数据可带走 | 浏览器端 store-only ZIP；避免服务端 50 子请求 | 1.0 后段 |
| AI/OCR 搜索 | 图片文字/场景 | Workers AI 有免费额度但成本/隐私需评估 | 观察 |
| 桌面同步/移动 App | 商业级生态 | 超出本方案 | 另立 |

**明确不做**：实时协作编辑、Office 在线编辑、服务端视频转码、端到端加密、SOC 2/HIPAA、多租户计费（除非第 6 节改为 SaaS）。

### 3.5 非功能要求（商业级基线）

**SLO（应用层，非 Cloudflare 厂商 SLA）**：

| 指标 | 目标 |
|---|---|
| API 可用性 | ≥99.9%/月（错误预算 ~43 分钟） |
| API p95（列表/元数据） | ≤300 ms |
| 搜索 p95 | ≤500 ms（2 万节点） |
| 上传成功率 | ≥99%（网络正常） |
| 下载成功率 | ≥99.5% |
| 前端 LCP / INP / CLS（p75） | ≤2.5s / ≤200ms / ≤0.1 |
| RPO / RTO | 元数据 ≤24h / ≤4h |
| WCAG | 2.2 AA，无 critical/serious axe 问题 |

> Cloudflare Free 不提供 SLA；若对外承诺 SLA，需要付费计划/合同，与本方案“免费优先”冲突。商业级在此指产品质量，不是法律 SLA。

**安全基线（OWASP ASVS 5.0 L2 对齐）**：

- 认证：Access SSO + Worker 双重 JWT 验签；不新增自建密码登录。
- 授权：所有节点/分享/批量操作做 owner/角色校验；IDOR 测试覆盖；代登录强审计。
- 会话：Access 续期路径保留；CSRF 要求 `x-requested-with`（现有）；401 统一续期。
- 上传：MIME/大小白名单；HTML/SVG 强制 `attachment` + `CSP sandbox`（现有）；不执行用户内容。
- 响应头：`_headers` + Worker 中间件统一设置：
  ```http
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; frame-src 'self'; connect-src 'self'; worker-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  ```
  - `script-src` 需要 `'wasm-unsafe-eval'`（`hash-wasm` 的 WebAssembly）；若改用纯 Web Crypto 可移除。
  - HSTS 同时在 Cloudflare Zone 开启，`_headers` 兜底；不要急着加 `preload`。
  - PDF 预览用同源 iframe，故 `frame-src 'self'`；不要放宽到任意源。
- 限流：分享密码 WAF 规则 + 服务端失败计数；上传/批量按用户限速（应用层或 WAF）。
- 秘密：R2 S3 密钥、Access AUD、HMAC 密钥全部走 `wrangler secret`；定期轮换；仓库无明文。
- Cloudflare 账户本身开启 2FA，API Token 最小权限、按环境分离；Access 是单点依赖，状态页/runbook 要写明。
- 供应链：lockfile、Dependabot、`npm audit`/OSV 扫描、GitHub Actions 固定 SHA。
- 威胁模型：公开分享 Token 爆破（128-bit 随机，不可行）、密码爆破（限流）、IDOR、XSS（沙箱/转义）、CSRF、配额滥用（服务端原子校验）、R2 key 猜测（UUID + owner 校验）、SSRF（无用户可控 URL 抓取）。
- 日志：不记录密码/Token/内容；IP/UA 哈希；审计保留 180 天。

**隐私与合规**：

- 最小化收集：仅 Access 提供的邮箱/姓名；不接第三方分析 Cookie（Cloudflare Web Analytics 无 Cookie）。
- 数据生命周期：回收站 30 天、版本 30 天、审计 180 天、Workers Logs 3 天、备份 30 天。
- 用户权利：导出全部数据（客户端 ZIP + JSON 清单）、删除账户（30 天宽限后彻底清理）。
- 文档：隐私政策、服务条款、安全说明、`security.txt`、子处理者（Cloudflare）。
- 若对外 SaaS：需 GDPR/CCPA、DPA、数据区域、删除请求 SLA——另立方案。

**可靠性**：

- 幂等：上传 init、批量操作、分享下载计数；重试安全。
- 重试：仅幂等请求自动重试；指数退避 + 抖动；401 续期一次；429 尊重 `Retry-After`。
- 熔断：R2/D1 连续失败时快速失败并提示，避免请求堆积。
- 迁移：expand-contract；部署前 bookmark；回滚脚本。
- 环境：staging Worker + D1 + R2 + Access 应用；生产发布前 smoke test。
- 特性开关：新 UI/批量引擎/版本默认关闭，按用户/全局开启。

### 3.6 商业级发布标准（Definition of Done）

- [ ] 所有 P0 功能验收通过；P1 有明确排期。
- [ ] 最坏端点/定时任务 ≤40 子请求；计数器测试常绿。
- [ ] 存储全局预算生效；回收站/版本计量准确；80/95/100% 提示可用。
- [ ] 分享上限/一次性/撤销/审计通过并发测试。
- [ ] 审计覆盖 100% mutation；管理员不可篡改。
- [ ] 备份恢复演练成功；RPO/RTO 达标；runbook 归档。
- [ ] WCAG 2.2 AA 审计：无 critical/serious；键盘全流程；读屏抽测。
- [ ] CWV p75 达标；首屏 JS ≤250KB gzip；路由级代码分割。
- [ ] 安全头/CSP/HSTS 生效；`npm audit` 无 high/critical；威胁模型评审。
- [ ] staging + 生产 smoke test + 回滚演练。
- [ ] 隐私/条款/安全页/`security.txt` 上线。
- [ ] 监控/告警/成本仪表可用；月度成本报告模板。

## 4. 第三部分：行业权威 UX 最佳实践

### 4.1 采用的标准与参考

| 标准/资料 | 用途 |
|---|---|
| **WCAG 2.2 AA**（W3C） | 可访问性验收：对比度、焦点可见、键盘、目标尺寸（≥24×24 CSS px；主操作 44×44）、状态消息、表单标签 |
| **WAI-ARIA Authoring Practices（APG）** | Dialog（焦点陷阱/恢复/`aria-modal`）、Menu Button（方向键/打开焦点）、Combobox（搜索）、Grid/Listbox |
| **Nielsen Norman Group 十项可用性启发** | 产品评审与文案/交互决策 |
| **ISO 9241-110:2020** | 交互原则（任务适合性、自描述、可控性、容错等）的补充参考 |
| **Core Web Vitals** | LCP ≤2.5s、INP ≤200ms、CLS ≤0.1（p75，移动端） |
| **Apple HIG / Material Design 3** | 触控目标、底部弹层、动效与手势惯例 |
| **OWASP ASVS 5.0 L2 / Top 10** | 安全 UX：错误不泄露信息、限流、会话、上传 |
| **Google Drive / Dropbox / OneDrive 惯例** | 多选、拖拽、冲突处理、撤销、分享、回收站、存储提示 |

### 4.2 MStor 的十条 UX 原则

| # | 原则 | 对应启发 | 在 MStor 的落地 |
|---|---|---|---|
| 1 | **状态始终可见** | 系统状态可见性 | 全局上传进度、存储条、离线条、会话续期提示 |
| 2 | **用户掌控** | 用户控制与自由 | 暂停/取消/继续上传；删除/移动可撤销；可关闭通知 |
| 3 | **错误预防优先** | 错误预防 | 配额预检、覆盖确认、重名策略、危险操作二次确认 |
| 4 | **一致而非惊喜** | 一致性与标准 | 统一术语/图标/按钮位置；桌面与移动同一心智模型 |
| 5 | **识别优于回忆** | 识别而非回忆 | 面包屑、最近、收藏、标签、快捷键帮助 |
| 6 | **专家高效、新手简单** | 灵活性与效率 | 键盘/多选/拖拽；同时保留大按钮与清晰文案 |
| 7 | **反馈及时且不打扰** | 系统状态可见性 | 进度/速度/ETA；`aria-live`；成功轻提示，失败可操作 |
| 8 | **错误可恢复** | 帮助用户识别/诊断/恢复 | 说清“发生了什么 + 下一步”；重试；请求 ID；撤销 |
| 9 | **默认可访问** | 包容性设计 | 键盘全流程、读屏、对比度、减少动效、200% 缩放 |
| 10 | **信任可验证** | 透明度 | 审计、分享状态/过期、存储占用、隐私说明 |

### 4.3 现状评审：优势与差距

**已经做得好的（保留，不要重写）**：

- 虚拟列表、骨架屏、空状态、离线条、拖拽上传/移动、批量选择、键盘导航、右键菜单、确认弹窗。
- 触控目标：`IconButton` 44×44 且 `aria-label` 必填（`IconButton.tsx:3-8`）；`Button` 有 `.tap` 粗指针扩展。
- 反馈：Toast `role="alert"`（`Toaster.tsx:46`）；上传列表 `aria-live="polite"`（`UploadPanel.tsx:24`）。
- 主题：暗色 token 与 `prefers-color-scheme`、`prefers-reduced-motion`（`index.css:60,115,175,235`）。
- 会话：Access 续期 + 10 秒守卫，避免白屏循环。
- 安全：下载内容 `CSP sandbox` + 危险 MIME 强制 attachment（`serve.ts:6-23`）。

**差距（按影响排序，均有代码证据）**：

| # | 差距 | 证据 | 影响 |
|---|---|---|---|
| 1 | 弹窗缺少 `role="dialog"`、`aria-modal`、`aria-labelledby`、焦点陷阱/恢复、背景滚动锁 | `Dialog.tsx:17-25` 只处理 Escape | 读屏/键盘用户体验断裂；商业级不可接受 |
| 2 | 预览层同样无对话框语义/焦点管理 | `PreviewModal.tsx:58-66` 是普通 `div` | 焦点跑到背景；Esc 关闭但焦点不回归 |
| 3 | 右键菜单无方向键导航/焦点管理 | `ContextMenu.tsx:38-53,57-80` 有 `role=menu/menuitem`，但只处理 Escape/点击 | APG 菜单键盘模式不完整 |
| 4 | 上传队列绑定 Browser 页面 | `Browser.tsx:44,445`；`useUploadQueue` 无全局挂载 | 切页后进度/控制消失；用户以为上传失败 |
| 5 | 大文件先算全量 SHA-256 再上传，且在主线程 | `uploads.ts:31-43` 8MB 分块；`useUploadQueue.ts:129` 上传前 await | 4GB 视频需等待数十秒到数分钟（取决于设备）；INP 抖动 |
| 6 | 网格用原图当缩略图 | `FileList.tsx:502`；`serve.ts:25-28` 注释承认需付费 Image Resizing | 首屏流量大、LCP 差、手机流量浪费 |
| 7 | 无路由级代码分割 | `App.tsx:9-13` 全量静态导入 | 首屏 JS 偏大；设置/回收站代码也首屏加载 |
| 8 | 应用壳无 CSP/HSTS/安全头 | 全仓无 `_headers`/CSP 配置 | XSS 纵深不足；商业安全评审不过 |
| 9 | 无 ErrorBoundary | 全库无 `componentDidCatch`/`errorElement` | 渲染异常即白屏 |
| 10 | 删除/移动无即时撤销 | 只有 `ConfirmDialog`；回收站是“事后恢复” | 多一步、易误操作（NN/g 用户控制） |
| 11 | 上传 XHR 401 不续期 | `uploads.ts:88-91` 直接 reject | 长传中会话过期即失败 |
| 12 | 搜索仅 50 条、无过滤/分页/高亮 | `search.ts:18,23`；`SearchBox.tsx` 仅防抖 | 大库找不到文件 |
| 13 | 无收藏/最近/标签 | schema 无相关表 | 文件一多只能靠目录 |
| 14 | 移动端右键菜单依赖 `onContextMenu` | `FileList.tsx:494` | 触屏长按需真机验证/补齐 |
| 15 | 无 RUM/CWV/可用性度量 | 无 web-vitals/analytics | 性能与体验无法回归 |
| 16 | 中文硬编码 | 全组件中文字符串 | 国际化需全量抽字符串（决策 D5） |

### 4.4 UX 工作包（带验收标准）

#### U1 对话框与菜单可访问性（P0）

- 统一 `Dialog`/`PreviewModal`：`role="dialog"`、`aria-modal="true"`、`aria-labelledby`、打开时焦点入内、Tab 循环、Esc 关闭、关闭后焦点回触发元素、背景 `inert`/滚动锁。预览的媒体/PDF 协议见 §2.10，U1 只负责可访问性外壳。
- `ContextMenu` 按 APG 菜单：打开聚焦第一项、上下键循环、Home/End、Esc 关闭并回焦。
- 测试：axe 无 critical/serious；键盘-only 用例；读屏抽测。
- **验收**：不碰鼠标可完成“打开菜单→选择→弹窗输入→确认→关闭”全流程。

#### U2 全局上传体验（P0）

- 见 B2；额外 UX：全局浮层可折叠、显示成功/失败/剩余时间；完成后 `aria-live` 汇总；错误含原因与重试。
- **验收**：切页不丢；刷新可恢复；失败可重试；无重复文件。

#### U3 反馈与错误系统（P0）

- 所有异步操作有 loading/成功/失败三态；错误文案 = 发生了什么 + 为什么 + 下一步；附请求 ID。
- Toast 保持错误 `role="alert"`；成功提示用 `role="status"`/polite，批量汇总用容器 `aria-live`；避免 4 秒内多条堆叠遮挡。
- 网络离线/429/5xx/配额/权限分别有可操作提示；不要只显示“请求失败”。
- **验收**：模拟 401/429/500/断网，用户都能知道下一步；读屏能播报。

#### U4 撤销与破坏性操作（P0）

- 删除/移动后 8 秒 Snackbar 撤销；彻底删除需输入名称或二次确认（管理员）。
- 回收站入口常驻；显示保留天数与到期时间。
- **验收**：误删 100 项可一键恢复；彻底删除不可误触。

#### U5 媒体与文档预览（P0/P1）

- 协议实现见 §2.10；UX 不得用 `fetch` 整包下载视频/PDF，直接使用 `<video>`/`<iframe>`/PDF.js，让浏览器发 Range。
- 上传时客户端生成 320px WebP 缩略图（图片，按 EXIF Orientation 纠正，q≈0.8）和视频首帧海报；`thumb_key` 存入 nodes；网格只加载缩略图，灯箱加载原图。
- 缩略图约 20–40KB/个；1 万文件约 0.2–0.4GB，计入存储预算。
- 图片/视频布局写入 `width/height`，避免 CLS；`loading="lazy"` + `decoding="async"`。
- 灯箱：左右切换、Esc、双指缩放、下滑关闭、视频续播位置；键盘可达。
- 时间线按 `taken_at`（EXIF，客户端解析）分组；隐私：默认不存 GPS。
- HEIC/RAW 或视频首帧解码失败时回退文件图标/占位，不阻塞上传；缩略图生成放 Web Worker/空闲时执行。
- PDF：Phase 1 原生查看器，Phase 2 PDF.js（翻页/缩放/页码/文本层）；Office：Phase 2 DOCX/XLSX 客户端渲染，失败/超大降级下载。
- 文本：前 1MB + 截断提示；日志可看结尾；Markdown 消毒；代码高亮按需加载。
- **验收**：100 张图网格首屏传输 <2MB；LCP ≤2.5s；1GB MP4 可拖动进度条且不整包下载；50MB PDF 可按页打开；灯箱键盘/触屏可用；不支持的编码有下载提示。

#### U6 搜索与导航（P0/P1）

- 搜索框遵循 Combobox 模式：`aria-expanded`、`aria-controls`、上下键、Enter、Esc；结果高亮；无结果有建议。
- 服务端过滤 + 分页；搜索历史（localStorage）；保存搜索（1.x）。
- **验收**：键盘可完成搜索到打开文件；2 万节点 p95 <500ms。

#### U7 可访问性专项（P0）

- WCAG 2.2 AA 全量审计：对比度、焦点可见、200% 缩放、屏幕阅读器（VoiceOver/NVDA 抽测）、目标尺寸、状态消息。
- CI 加 `axe-core`（组件）+ Playwright `@axe-core/playwright`（核心页）。
- **验收**：零 critical/serious；键盘全流程；读屏完成上传/分享/恢复。

#### U8 性能与 Core Web Vitals（P0）

- 路由级 `lazy()` + Suspense；首屏 JS ≤250KB gzip；字体子集/`font-display: swap`。
- 缩略图方案（U5）；上传哈希移入 Web Worker；批量预签名。
- 接入 `web-vitals`（采样 10%）+ Cloudflare Web Analytics；Lighthouse CI 预算。
- **验收**：LCP ≤2.5s、INP ≤200ms、CLS ≤0.1（p75 移动端）；Lighthouse 性能 ≥90。

#### U9 移动端与触控（P1）

- 长按打开上下文菜单；底部弹层（现有 Dialog 已做 bottom sheet）；安全区；44px 主操作；无 hover-only 操作；灯箱手势。
- 相机上传/相册多选；弱网提示与重试。
- **验收**：iOS Safari/Android Chrome 真机完成上传/分享/恢复；无横向滚动。

#### U10 信任界面与新手引导（P1）

- 存储条、分享过期徽标、回收站保留提示、审计入口、状态页/健康提示。
- 首次登录：3 步引导（上传/建文件夹/分享）；空状态 CTA；快捷键帮助（`?`）；PWA 安装提示。
- **验收**：新用户 5 分钟内完成首次上传+分享；帮助可发现。

### 4.5 体验度量与研究

| 类型 | 指标 | 方法/目标 |
|---|---|---|
| 性能 | LCP/INP/CLS p75 | RUM + Lighthouse CI；达标见 U8 |
| 任务 | 首次上传/分享/恢复成功率 | 5 人可用性测试，≥90% |
| 效率 | 完成核心任务时间 | 上传文件夹 <2 分钟；分享 <1 分钟 |
| 满意度 | SUS | ≥80 |
| 质量 | axe critical/serious | 0 |
| 业务 | 上传失败率、搜索成功率、分享创建率 | 每周看板 |
| 支持 | 每用户求助次数 | 月度下降 |

**研究节奏**：每季度 5 人远程可用性测试（任务脚本固定）；每次大版本前 axe + 键盘走查；每月看 CWV/错误率。不要用“用户没抱怨”代替测量。

### 4.6 移动端与可访问性细则

- 触控目标：主操作 ≥44×44；次级 ≥24×24（WCAG 2.2 2.5.8）；相邻目标间距足够。
- 手势：长按=上下文菜单；左滑=删除/分享（可选，需可发现）；下拉刷新；灯箱滑动切换；避免与浏览器手势冲突。
- 焦点：所有弹层焦点陷阱/恢复；路由切换后焦点到主标题；跳过导航链接。
- 对比度：正文 ≥4.5:1；大字 ≥3:1；禁用态仍可辨识；暗色模式单独验证。
- 动效：尊重 `prefers-reduced-motion`（已有 CSS，需确认组件动画也遵守）。
- 表单：`label` 关联、错误就地提示、`aria-describedby`、不要只用颜色表达错误。
- 读屏：图标按钮 `aria-label`（已做）；上传/Toast `aria-live`；文件列表行可读名称/大小/类型；表格用语义化角色。
- 缩放：200% 不丢内容/不横向滚动；移动端横屏可用。

### 4.7 文案与错误规范

- **语气**：简洁、具体、不指责用户；中文统一“你/你的”，避免“您”与“你”混用。
- **错误结构**：`发生了什么` + `为什么` + `下一步` + `错误编号（可选）`。例：“上传失败：存储空间不足（已用 10.0/10.0 GB）。请清理回收站或联系管理员扩容。错误编号 A1B2C3。”
- **禁止**：只显示 `HTTP 500`、`请求失败`、`未知错误`；暴露堆栈/SQL/Token。
- **破坏性操作**：说明后果与可恢复性（“将移至回收站，30 天后自动删除”）。
- **成功反馈**：轻量、可撤销；批量操作给数量与失败明细。
- **术语表**：文件/文件夹（不用“目录”对用户）、回收站、分享链接、版本、配额/存储空间；全站一致。
- **空状态**：说明 + 主 CTA（上传/新建文件夹/查看帮助），不要只写“暂无数据”。

## 5. 第四部分：90–105 天路线图与验收

### 5.1 阶段计划

| 阶段 | 时间 | 目标 | 主要交付 | 退出标准 |
|---|---|---|---|---|
| **Phase 0** 基线 | 第 1 周 | 把“感觉”变成“数据” | 子请求计数器；CPU/延迟日志；Lighthouse/axe 基线；存储盘点；staging；CI 分支修正；决策 D1–D9 | 每个端点有成本基线；最坏输入可复现；预算阈值确定 |
| **Phase 1** 免费版加固 + 数据/预览协议 | 第 2–6 周 | 先不崩、再可信、协议正确 | A1/A2/A3/A6/A8；§2.9 物化路径不变量/`getNode` 过滤/修复任务；§2.10 GET/HEAD/Range/ETag/416/304；预览弹窗可访问性；全局上传 v1 + 幂等；审计日志；备份/恢复 runbook；WAF/CSP/HSTS；`deleted_at` 数据安全修复；XHR 401 续期 | 最坏端点/cron ≤40；100 项还原可用；Range 测试矩阵全绿；预算生效；审计覆盖 mutation；备份演练成功 |
| **Phase 2** 商业级 1.0 功能 | 第 7–11 周 | 补齐商业级能力 | 分享 2.0；版本/`content_version`；缩略图/时间线；PDF.js；Office（DOCX/XLSX）；搜索 2.0+分页；收藏/最近/标签；复制/撤销；管理台；通知 v1；全局上传 v2 | 每项验收通过；预览矩阵通过；成本影响可解释；无 P0 缺陷 |
| **Phase 3** 体验/合规/发布 | 第 12–15 周 | 达到可发布质量 | WCAG 2.2 AA 审计与修复；CWV/代码分割；移动手势；新手引导/帮助；隐私/条款/导出/删号；DR 演练；可用性测试；staging smoke；发布 | DoD 全绿；零 critical/serious；CWV 达标；回滚演练成功 |

> 上述为紧凑排期（约 15 周/105 天）；单人全栈建议预留 15–20% 缓冲。若严格按 90 天发布，冻结 P1（PDF.js、Office、时间线、内部共享、收藏/标签），1.0 只交付 P0。只做 Phase 0–1（免费版加固 + 数据/预览协议），约 6–7 周，已经能消除“批量 500 / cron 超限 / 白屏 / 存储失控 / 预览拖动失败”等高风险问题。

### 5.2 依赖关系与顺序

1. **§2.9 树不变量 + `getNode` 过滤**先于批量移动/还原/版本；否则路径/软删除 bug 会被新功能放大。
2. **A1 子请求预算**必须先于任何“批量增强/版本/分享上限”，否则新功能会继续踩 50 上限。
3. **A2 存储计量**必须先于版本、缩略图、回收站策略，否则费用/配额不可解释。
4. **§2.10 Range/HEAD/ETag/416** 先于 PDF.js/视频增强/Office；协议不对，前端做得再好也会整包下载。
5. **审计表**先于分享 2.0/管理台，避免事后补事件。
6. **缩略图**先于时间线/相册；**分页**先于收藏/最近的大列表。
7. **staging + 迁移 bookmark**先于 schema 变更；**CSP/安全头**在接入 Web Analytics/RUM 之前定稿。
8. **全局上传 v1** 可先只做“提升到 AppShell + 切页不丢”，v2 再做 IndexedDB 恢复/幂等，降低风险。

### 5.3 测试与质量门禁

**测试金字塔**：

- **单元/集成**（现有 188 客户端 + 142 服务端）：继续覆盖 API/权限/配额/分享/回收站。
- **新增预算测试**：用计数包装器统计 D1 语句/R2 操作/`fetch`，对最坏输入断言 ≤40；覆盖 restore/move/purge/cron/complete。
- **树不变量测试**：2 万节点合成树，随机 create/move/rename/delete/restore；断言 `path = parent.path || parent.id || '/'`、无环、深度 ≤100、面包屑正确。
- **Range/预览测试**：`parseRange` 表驱动 20+ 用例；Miniflare 取回字节比对 `sha256`；206/416/304/HEAD；浏览器 MP4 seek/PDF 翻页。
- **权限矩阵**：owner/member/admin/分享 token/禁用用户 × 读/写/删/分享；IDOR 负例。
- **并发**：分享下载上限、配额、同名上传、还原、移动。
- **幂等/恢复**：上传 init 重试、分片续传、刷新恢复、批量部分失败。
- **迁移**：空库/存量库/回滚；Time Travel 恢复后 smoke。
- **E2E（Playwright）**：登录（测试 Access 模式）、上传/分享/恢复/搜索/设置；移动视口；键盘-only；axe。
- **性能**：Lighthouse CI（移动）预算；首屏 JS ≤250KB gzip；大目录 1,000 行滚动。
- **安全**：`npm audit`/OSV、Dependabot、secret scan、CSP 无违规、限流生效、上传 XSS 负例。
- **成本/负载**：模拟家庭媒体库 1,200 请求/天，记录 D1 rows、R2 ops、子请求 p95。
- **灾备**：季度从 Time Travel 恢复 + 抽样校验 sha256。

**CI 门禁**：

- 修正 `.github/workflows/ci.yml` 的 `push.branches: [main]` → `master`（仓库默认分支是 `master`，当前 push 不触发 CI，PR 才触发）。
- PR 必过：typecheck、lint、客户端/服务端测试、build、预算测试。
- Nightly：E2E、Lighthouse、axe、依赖扫描。
- Release：staging smoke + 迁移演练 + 回滚演练 + 手工验收清单。

### 5.4 发布、回滚与运维

- **环境**：`production`（stor.msxor.com）+ `staging`（独立 Worker/D1/R2/Access 应用，数据脱敏）。
- **发布**：`npm run check` → 构建 → staging 部署 + smoke → 生产部署 → 5 分钟观察日志/错误率。
- **回滚**：Workers 版本回滚（`wrangler rollback`）；D1 迁移采用 expand-contract，旧代码可读新结构；迁移前 bookmark；R2 不做原地覆盖（内容不可变）。
- **特性开关**：新上传引擎、版本、缩略图、分享上限、管理台分开关；按用户/全局灰度。
- **Runbook**：配额超限、R2 故障、D1 日限额、Access 配置错误、Cron 失败、分享被滥用、数据误删恢复。
- **告警**：健康检查、5xx 率、cron 失败、R2 用量/账单、D1 日读写接近阈值；发送到管理员邮箱。
- **值班**：家庭/小团队无需 24×7；定义“工作日 24h 响应、周末尽力”的期望，避免虚假 SLA。

### 5.5 风险登记

| 风险 | 概率/影响 | 缓解 |
|---|---|---|
| 免费版 CPU 超限（分享密码） | 中/高 | WAF 限流、实测、保留 100k 或升级 Paid |
| 子请求重构引入回归 | 中/高 | 计数器测试、staging、特性开关、分批上线 |
| R2 费用随媒体增长 | 高/低 | 全局预算、80/95% 告警、季度成本复盘 |
| 回收站/版本计量改变用户预期 | 中/中 | 上线前公告、UI 明确“30 天后释放”、管理员可调 |
| D1 迁移/恢复失败 | 低/高 | Time Travel bookmark、expand-contract、演练 |
| 无障碍改造范围失控 | 中/中 | 先 P0（对话框/键盘/对比度/axe），再做增强 |
| 性能回归 | 中/中 | CWV 预算、Lighthouse CI、RUM、代码分割 |
| Access 50 用户上限 | 低/中 | 文档说明；超限评估 $7/用户/月或换认证 |
| Access/Cloudflare 单点故障 | 低/高 | 状态页、导出备份、接受免费版无 SLA；关键业务上付费计划 |
| 无厂商 SLA | 高/中 | 明确“产品质量 ≠ 法律 SLA”；需要 SLA 则付费 |
| 范围蔓延 | 高/高 | 1.0 DoD 冻结；1.x 列表隔离；每阶段可中止 |
| i18n 全量抽字符串成本 | 中/低 | 先抽核心文案/日期/字节格式，不急于上英文 |

## 6. 需要拍板的决策

| ID | 决策 | 选项 | 推荐 | 影响 |
|---|---|---|---|---|
| **D1** | 免费优先 vs 商业优先 | A. Free-first + R2 按量<br>B. Workers Paid $5 + 更高安全/批量 | **A**，Phase 0 实测后再评估 B | A 需要批量拆分/100k PBKDF2；B 解锁 5min CPU、10k 子请求、600k PBKDF2 |
| **D2** | 产品边界 | A. 家庭/亲友私有（≤50 用户）<br>B. 对外 SaaS | **A** | B 需要 Workspace 多租户、计费、合规、Access 付费，另立方案 |
| **D3** | 存储计量 | A. 活跃+回收站+版本都计入<br>B. 仅活跃文件 | **A** | A 防止 R2 隐形超限；需要改软删除扣减语义与 UI 说明 |
| **D4** | 版本默认 | A. 文档默认 3 版/30 天，媒体默认 1 版<br>B. 全默认关闭 | **A** | 存储成本可控；需在设置页可调 |
| **D5** | 国际化 | A. 先中文，抽字符串<br>B. 立即中英双语 | **A** | B 增加 2–3 周；A 为后续留路 |
| **D6** | 分享密码强度 | A. 100k + WAF 限流<br>B. 600k + Workers Paid | **A**（家庭）/**B**（商业安全承诺） | B 每月 $5，但满足 OWASP 建议 |
| **D7** | 1.0 是否含 WebDAV/API Token | A. 不含，放 1.x<br>B. 含 | **A** | B 需独立认证路径/主机名，复杂度高 |
| **D8** | 审计保留 | A. 180 天<br>B. 1 年 | **A** | 180 天足够家庭；可导出归档 |
| **D9** | 树模型 | A. 邻接表 + 物化路径<br>B. 闭包表为主 | **A** | B 祖先/ACL 更优雅，但移动/导入写放大；选 B 需按 §2.9.4 迁移并接受 D1 Free 写入压力 |

> 若 D2 选 B（SaaS），本方案的架构部分仍适用，但功能/合规/计费需另加 4–6 周，且 Access 超过 50 用户后成本会主导商业模型。

---

## 7. 附录

### 附录 A：免费版额度来源

| 资料 | 链接 | 页面更新时间 |
|---|---|---|
| Workers Limits | https://developers.cloudflare.com/workers/platform/limits/ | 2026-10-12 |
| Workers Pricing | https://developers.cloudflare.com/workers/platform/pricing/ | 2026-10-02 |
| D1 Limits | https://developers.cloudflare.com/d1/platform/limits/ | 2026-04-21 |
| D1 Pricing | https://developers.cloudflare.com/d1/platform/pricing/ | 2026-04-21 |
| R2 Pricing | https://developers.cloudflare.com/r2/pricing/ | 2026-10-01 |
| Static Assets Billing | https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ | 2026-04-23 |
| Web Crypto | https://developers.cloudflare.com/workers/runtime-apis/web-crypto/ | 2026-09-30 |
| Rate Limiting Rules | https://developers.cloudflare.com/waf/rate-limiting-rules/ | 2026-08-25 |
| R2 Object Lifecycles | https://developers.cloudflare.com/r2/buckets/object-lifecycles/ | 2026-04-21 |
| Access Plans | https://www.cloudflare.com/plans/zero-trust-services/ | 访问于 2026-10-20 |

关键数字复核：

- Workers Free：100,000 请求/天、10ms CPU/次、50 子请求/次、静态资源免费不限量。
- D1 Free：5M 行读/天、100k 行写/天、5GB 存储、单库 500MB、50 查询/次。
- R2 Free：10GB-month、1M Class A、10M Class B、出口免费、删除免费。
- Access Free：50 用户；超出 $7/用户/月。
- Workers Paid：$5/月，10M 请求/月、30M CPU-ms/月、5min CPU/次、10k 子请求/次。
- Workers Logs：Free 200k 事件/天、3 天保留。

### 附录 B：端点子请求预算（现状 → 目标）

| 端点/任务 | 现状估算 | 目标 | 手段 |
|---|---:|---:|---|
| `batch-restore` 100 项 | 600–800 | ≤40/请求，客户端分批 | 分组还原 + 批量 UPDATE；每批 10 项或按父目录分组 |
| `batch-move` 100 目录 | ~105 | ≤10* | 物化路径零查询判祖先；批量 UPDATE |
| `batch-purge` 500 项 | 30–40（口径待复核） | ≤10/请求*，6 批 | 每批 90；多行 INSERT；R2 交给 cron |
| 每日 cron（四任务） | >2,000 | 5 个触发器，各 ≤40 | 拆分 + 有界 + 集合式 |
| 孤儿清扫 500 | ~1,500 | ≈4 次/40 个键 | 一次 IN 查询 + 批量 delete + 一次 DELETE |
| `GET /api/files` | 4–6 | 4–6 | 加 LIMIT/游标 |
| 短搜索（1–2 字符） | 全表扫描 N 行 | ≤200 行/查询 | 前缀 + LIMIT 20 + 索引 |
| 1GB 上传 | 66 个请求 | ~5–7 | 分块 batch 预签名 + 直传 + complete |
| `GET/HEAD /content`（无 Range） | 3 | 3 | 鉴权 + 节点 + R2 get/head；流式 |
| `GET /content`（Range 206） | 3 | 3 | 同上，R2 range；不额外查 D1 |
| `GET /thumb` | 3 | 3 | 鉴权 + 节点 + R2；缩略图 key 不可变 |
| PDF.js 首屏（1–3 Range） | 3–9 | 3–9 | 每个 Range 一次独立请求；按页懒加载 |
| 100 图网格 | 300 次请求 | 300 次请求 | 缩略图 + lazy；按“请求数”不按“子请求”算 |
| 分享下载 | ~5 | ~6 | 加原子上限/审计 |
| complete | 8–12 | 8–12 | 加 HeadObject 校验 |

> 估算按“每条 D1 语句/R2 操作 = 1 子请求”保守计；带 `*` 的目标值假设 `db.batch()` 计 1 次调用，若实际按语句计则需进一步拆分。最终以计数器与线上日志为准。

### 附录 C：成本计算说明

- R2 存储：`max(0, GB - 10) × $0.015/GB-month`；示例：50GB → $0.60；100GB → $1.35；200GB → $2.85；1TB → ~$15.21。
- R2 Class A 超出：$4.50/百万；Class B 超出：$0.36/百万；家庭规模基本不触发。
- Workers Paid：$5/月；超出 10M 请求 $0.30/百万；超出 30M CPU-ms $0.02/百万 ms。
- D1 Paid：25B 行读/月、50M 行写/月、5GB 存储；超出读 $0.001/百万行、写 $1.00/百万行、存储 $0.75/GB-month。
- Access：≤50 用户 $0；超出 $7/用户/月。
- 不含税、汇率与 Cloudflare 未来调价；以账单为准。

### 附录 D：数据模型增量（DDL 草案）

```sql
CREATE TABLE IF NOT EXISTS file_versions (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_no ON file_versions(node_id, version_no);
CREATE INDEX IF NOT EXISTS idx_versions_node ON file_versions(node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_versions_key ON file_versions(r2_key);
CREATE INDEX IF NOT EXISTS idx_versions_expire ON file_versions(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  request_id TEXT,
  ip_hash TEXT,
  ua_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action, created_at DESC);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, node_id)
);

CREATE TABLE IF NOT EXISTS node_views (
  user_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, node_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (owner_id, name)
);
CREATE TABLE IF NOT EXISTS node_tags (
  node_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (node_id, tag_id)
);

CREATE TABLE IF NOT EXISTS share_downloads (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  ip_hash TEXT,
  ua_hash TEXT,
  dedupe_key TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_share_downloads ON share_downloads(share_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_downloads_dedupe
  ON share_downloads(share_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  dedupe_key TEXT,
  payload_json TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS storage_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  used_bytes INTEGER NOT NULL DEFAULT 0, -- 总占用 = 四分项之和
  active_bytes INTEGER NOT NULL DEFAULT 0,
  trash_bytes INTEGER NOT NULL DEFAULT 0,
  version_bytes INTEGER NOT NULL DEFAULT 0,
  thumb_bytes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

ALTER TABLE nodes ADD COLUMN thumb_key TEXT;
ALTER TABLE nodes ADD COLUMN width INTEGER;
ALTER TABLE nodes ADD COLUMN height INTEGER;
ALTER TABLE nodes ADD COLUMN taken_at INTEGER;
ALTER TABLE nodes ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shares ADD COLUMN max_downloads INTEGER;
ALTER TABLE shares ADD COLUMN allow_download INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shares ADD COLUMN last_download_at INTEGER;
ALTER TABLE uploads ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_uploads_idem ON uploads(idempotency_key) WHERE idempotency_key IS NOT NULL;
-- uploads.status 现有 CHECK 只有 pending/done；扩 completing/aborted 需 expand-contract 重建表
-- 或新增 upload_state 列，避免直接改 CHECK 导致旧行不可写
```

> SQLite 的 `ALTER TABLE ... ADD COLUMN` 不支持 `IF NOT EXISTS`；实施时用迁移版本控制。所有新列可空/带默认值，保证旧代码可读。

### 附录 E：UX 验收清单（节选）

**WCAG 2.2 AA**

- [ ] 1.4.3 对比度：正文 ≥4.5:1，大字 ≥3:1（明/暗两套）。
- [ ] 1.4.4 缩放：200% 不丢内容。
- [ ] 1.4.10 回流：320px 宽无横向滚动。
- [ ] 2.1.1 键盘：所有功能可键盘完成。
- [ ] 2.2.2 暂停/停止：上传/自动刷新可暂停。
- [ ] 2.4.3 焦点顺序合理；2.4.7 焦点可见。
- [ ] 2.4.11 焦点不被固定元素遮挡（2.2 新增）。
- [ ] 2.5.8 目标尺寸 ≥24×24（主操作 44×44）。
- [ ] 3.3.1 错误识别：就地提示 + 文字说明。
- [ ] 4.1.3 状态消息：上传/Toast 通过 `aria-live` 播报。
- [ ] 对话框：`role=dialog`、`aria-modal`、焦点陷阱/恢复（APG）。

**NN/g 十原则抽查**

| 原则 | 检查点 |
|---|---|
| 状态可见 | 上传/存储/离线/续期均有可见状态 |
| 匹配现实 | “文件/文件夹/回收站/分享链接”术语一致 |
| 用户控制 | 暂停/取消/撤销/关闭通知 |
| 一致性 | 桌面/移动同一操作位置与图标 |
| 错误预防 | 配额预检、覆盖/重命名确认、彻底删除二次确认 |
| 识别而非回忆 | 面包屑/最近/收藏/快捷键帮助 |
| 效率 | 多选/拖拽/键盘/批量 |
| 极简 | 首屏只保留核心操作，设置分层 |
| 错误恢复 | 原因+下一步+重试+请求 ID |
| 帮助 | 空状态 CTA、帮助页、快捷键 `?` |

**CWV / 性能**

- [ ] LCP ≤2.5s、INP ≤200ms、CLS ≤0.1（p75 移动端）。
- [ ] 首屏 JS ≤250KB gzip；路由级分割。
- [ ] 1,000 行目录滚动流畅（虚拟列表）。
- [ ] 缩略图网格首屏 <2MB。

### 附录 F：与上一版方案的关系

上一版 `2026-10-18-mstor-refactor-plan.md` 以“行为不变的内部重构”为中心，方向与本方案不同，已被取代。其中**仍然有效且纳入本方案**的工程项：

- 批量移动 ≥50 项的 500 修复与分片策略（已提交 `38d2e90`）。
- 配额超限 R2 对象泄漏修复（已提交 `38d2e90`）。
- 登录白屏/续期修复（已提交 `40e6852`）。
- `getNode`/`resolveParent` 未过滤 `deleted_at` 的数据安全修复（Phase 1）。
- multipart complete 按实际对象大小记账（Phase 1，HeadObject 校验）。
- 上传 XHR 401 续期（Phase 1）。
- `errors.rateLimited` 死代码、CI 分支 `main`→`master`、ErrorBoundary（Phase 0/1）。
- 子请求/分片/集合式 SQL 的具体实现细节（本方案 A1/A8 直接采用）。

**不再作为主线**：为拆分而拆分的页面/组件重构、纯风格统一的文件搬迁、无用户价值的内部抽象。它们可以在触达相关功能时顺手做，但不单独占用阶段目标。

---

## 8. 结论

MStor 的免费版瓶颈不是“流量太贵”，而是三件事：

1. **单次 50 子请求**：批量还原、批量移动、cron 已经越线；必须集合式、拆分、加计数器。
2. **R2 10GB 与计量语义**：存储是唯一持续增长的成本；回收站/版本必须计入，否则“看起来免费、实际超限”。
3. **商业级信任与体验**：全局上传、分享治理、审计、备份恢复、版本、无障碍与性能预算，才是“商业级”的分水岭。

按本方案执行，家庭规模可以稳定运行在 **$0–3/月**；只有需要 OWASP 级分享密码、超大批量或服务端 ZIP 时，才需要 **$5/月 Workers Paid**。这比“为了免费而牺牲安全/体验”更符合商业级目标。








