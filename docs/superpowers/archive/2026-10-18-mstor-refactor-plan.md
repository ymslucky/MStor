> **已归档（2026-10-20）**：内容已合并入 [../plans/2026-10-20-mstor-saas-v2.md](../plans/2026-10-20-mstor-saas-v2.md)，以该文件为唯一权威。本文件仅作历史证据保留，不再维护。

# MStor 重构方案

> 状态：**已被 `2026-10-20-mstor-commercial-plan.md` 取代**（本文件仅保留为工程债核实记录）｜ 日期：2026-10-18 ｜ 基线：`master` @ `40e6852`（含批量操作 500 与登录续期两处修复，工作树干净）
> 参考：`README.md`（现状权威说明）、`docs/reports/2026-09-28-feature-upgrade-report.md`（功能地图）、`docs/superpowers/specs/2026-09-27-r2-nas-design.md`（历史设计稿）

## 1. 背景与目标

### 1.1 为什么现在做

最近一周连续修复的三个缺陷，复盘后指向同一批结构性问题：

| 缺陷 | 直接原因 | 结构性根因 |
| --- | --- | --- |
| 批量移动 ≥50 项整体 500 | 冲突检查把 `id NOT IN (…ids)` 与 name 绑定进同一语句，超 D1 单语句 100 参数上限 | D1 参数预算规则散落在各路由，靠开发者记忆（A1/A2） |
| 配额拒绝后 R2 对象泄漏 | 写对象之后、登记 nodes 之前抛错（配额拒绝）未回滚 | 上传落库"校验 → 插入 → 回滚 → 记账"四步在各路由手工拼装，无单一归属（A5） |
| 会话过期登录白屏 | SW 导航回退把整页刷新拦在缓存层，Access 永远收不到重登请求 | 空白页兜底缺失：无错误边界、未匹配路由渲染 null（B6） |

即：**服务端跨切面规则没有归属、客户端页面组件职责过载、工程守卫失效（CI 从未在 push 上运行，见 C1）**。本方案在不改变外部行为、不引入新框架的前提下消除这三类问题。

### 1.2 目标（可量化）

- 行为零变化；唯一例外是 3 个已确认的正确性缺陷（`deleted_at` 语义 A3、multipart 记账 A5、XHR 401 A7），单独提交、单独测试
- 测试基线不降：服务端 142 + 客户端 188 = 330 用例全绿、`npm run check` 零告警
- 关键文件瘦身：`Browser.tsx` ≈560 → ≤250 行；`FileList.tsx` ≈530 → ≤300；`AppShell.tsx` ≈220 → ≤150；`useUploadQueue.ts` ≈260 → ≤140
- 路由文件不再直接出现：D1 分片字面量、`UNIQUE constraint failed` 字符串判断、裸 `adjustUsedBytes`
- 每个 Phase 独立可部署、可中止；master 任意时刻保持绿色

### 1.3 明确不做

- 不拆多 Worker / 微服务——家庭规模，单体 Worker 是成本与复杂度上的正确选择
- 不换框架、不引入 ORM / 状态机库 / DI 容器（见原则 6）
- 不动 Cloudflare Access 认证链路与 SW/续期逻辑（刚经受修复验证）
- 不做数据库结构迁移（Schema 稳定，仅调整查询方式与调用归属）
- 不做与重构耦合的新功能（缩略图服务端生成、版本历史等仍走独立需求）

## 2. 现状盘点

### 2.1 需求与功能地图

| 领域 | 能力 | 关键实现 |
| --- | --- | --- |
| 身份与权限 | Access JWT 验签、自动建号 / email 锚定承接、停用检查、admin `x-act-as` 切换空间、CSRF 双头校验 | `server/middleware/access.ts`、`server/lib/users.ts` |
| 文件树 | 物化路径（`path` = 祖先 id 链 + 根哨兵行）、重命名/移动（目录子树前缀平移）、同名改名让位 | `server/lib/nodes.ts`、`routes/trash.ts#moveMany` |
| 上传（三通道） | ①小文件直传 `PUT /api/files/upload`（R2 实测大小硬校验 + 失败回滚）；②秒传 `POST /api/files/instant`（同 owner hash+size）；③大文件 multipart（init → 逐片预签名直传 → complete） | `routes/files.ts`、`routes/uploads.ts`、`lib/r2.ts` |
| 下载/预览 | Range 透传、inline/attachment 策略（不可信 mime 强制 attachment）、`dl=1` 强制下载 | `server/lib/serve.ts` |
| 分享 | 可选 PBKDF2 密码、过期天数、下载计数；公开路由 `/api/s` 在认证中间件之前挂载 | `server/routes/shares.ts` |
| 回收站 | 软删即扣减 `used_bytes`（batch 原子）、还原到原父或根、保留天数（settings 优先、env 回退）、cron 过期清理 | `server/routes/trash.ts` |
| 配额 | `users.used_bytes` 冗余列写入点同步增减 + cron 每日全表校准 | `lib/nodes.ts`、`server/index.ts#scheduled` |
| 搜索 | FTS5 trigram（≥3 码点）+ LIKE 退化；物化路径拼面包屑（替代递归 CTE） | `server/routes/search.ts` |
| PWA | 导航回退 denylist（`/api/`、`/cdn-cgi/`、`/auth/`）、`/auth/renew` 续期路径、旧 SW 兜底路由 | `client/src/lib/service-worker-navigation.ts`、`lib/renew.ts` |
| 前端体验 | 虚拟滚动（≥50 项）、多选、右键菜单、拖拽（移动/上传）、嵌套目录上传、断点续传、并发/限速设置、预览（图/视/音/PDF/文本）、键盘导航、act-as | `client/src/pages/Browser.tsx` 等 |
| 管理 | `/api/me/admin/*`：用户列表、配额调整 / 停用（`PATCH /admin/users/:id`）、设置读写（`GET\|PATCH /admin/settings`，含回收站保留天数），均 `requireAdmin` 守卫 | `server/routes/me.ts` |

### 2.2 运行时拓扑

```
Cloudflare Access（边缘，登录 / 续签）
        │
        ▼
Worker「mstor」 stor.msxor.com（wrangler.jsonc）
  ├─ /api/*   run_worker_first → Hono（accessMiddleware → routes）
  ├─ 其余     SPA assets（client/dist，not_found_handling: SPA）
  ├─ D1「mstor」  元数据（物化路径 + FTS5）
  ├─ R2「mstor」  对象（S3 API 预签名直传）
  └─ cron 03:00   四任务：过期回收站清理 / 孤儿对象清扫 / 超时分片会话中止 / used_bytes 全量校准
```

本地开发：`npm run dev`（wrangler dev :8787）+ `npm run dev:client`（vite 代理 `/api`）。

### 2.3 代码地图与规模

- **服务端 ≈1.9k 行**：`routes/`（trash ≈330、files ≈180、me ≈140、shares ≈134、uploads ≈108、search 48、dirs 34）、`lib/`（nodes ≈195、users 114、serve 61、logger 46、r2 38、errors 36、settings 5）、`middleware/access.ts` 98、`index.ts` 46
- **客户端 ≈5k 行**：`pages/`（Browser ≈560 + 测试 ≈550、SettingsPage 270、TrashPage 159、SharePage 146、SharesPage 141）、`components/`（FileList ≈530 等）、`hooks/`（useUploadQueue ≈260、useBatchOps 123、useFiles、useKeyboardNav）、`api/`（uploads ≈257、client、nodes、shares、trash、me、search、types）、`lib/`（storage、dirscan、resume、speed、settings、renew、service-worker-navigation 等）、`shell/AppShell.tsx` ≈220
- **测试 ≈4k 行**：`test/` 服务端 20 文件 142 用例（Miniflare 真实 D1 + R2 + 迁移 apply）；客户端 28 文件 188 用例（jsdom）
- **工程**：ESLint 9 flat + react-hooks、双 `tsc`、Prettier、GitHub Actions、`scripts/verify-access-config.mjs`（deploy 前置校验）、`sql/schema.sql` 与 migrations 的 parity 测试

### 2.4 数据模型要点

- `users`：`access_sub`（JWT sub）、`email`（跨身份锚定）、`used_bytes` 冗余列、`disabled_at`、`role`
- `nodes`：物化路径 + `is_dir` + `r2_key`/`size`/`mime`/`sha256`；active-only 部分唯一索引（同名）；FTS5 trigram 触发器；根哨兵行（`name=''`）
- `shares`：token / 密码哈希 / 过期 / 下载计数 / 撤销
- `uploads`：分片会话（key、part_size、已完成分片）
- `orphan_objects`：延迟清扫队列（1h 宽限，避开秒传 TOCTOU）
- `settings`：KV 白名单（`trash_retention_days` 等）

### 2.5 质量基线与工程实践

- 测试命令：`npm test`（client + server）、`test:ci`（+ build）；Miniflare 在 Windows 有 EBUSY 清理噪音（已知假噪音）
- 提交惯例：中文 conventional commits；文档：`docs/superpowers/{specs,plans}` + `docs/reports`
- 已知 CI 缺口见 C1；部署 `npm run deploy`（predeploy 校验 Access 配置 → vite build → wrangler deploy）

## 3. 问题清单

> 编号贯穿全文（附录 A 为 Phase 对照）。P0 = 结构/正确性，P1 = 维护成本高，P2 = 工程优化。

### A. 正确性与一致性（服务端）

**A1（P0）D1 参数预算规则散落**
证据：`trash.ts` 8 处分片循环（30/90 硬编码）+ 3 处手工占位符拼接；`search.ts:34-35`、`nodes.ts:105-107` 同类；`chunk` 甚至定义在 `routes/trash.ts:9`。
影响：任何新查询都要重新推导 100 参数上限；已因此产生一次线上 500（批量移动 ≥50 项）。

**A2（P0）路由模块被当作服务层跨模块导入**
证据：`chunk` / `parseIds` / `moveMany` / `softDeleteMany` / `permanentDeleteMany` / `restoreTrashNode` 定义于 `routes/trash.ts`，被 `files.ts`、`search.ts`、`shares.ts` 导入；`PART_SIZE` 定义于 `routes/uploads.ts`，被 `me.ts` 导入。
影响：依赖方向混乱（routes→routes），改一个路由文件波及面不可预测。

**A3（P0）`deleted_at` 语义靠调用方自觉**
证据：`nodes.ts:46-52` 的 `resolveParent`/`getNode` 均不过滤 `deleted_at`；`shares.ts:18` 手工补检查并注释；而 `dirs.ts:14`、`uploads.ts:20`、`files.ts:27` 未检查 → 可向已删除目录内新建节点 / 重命名已删除节点（生成不可见数据）；`GET /:id/content`（`files.ts:34`）对已删节点仍可下载（已核实客户端回收站无预览依赖，`TrashPage` 不引用 `contentUrl`，可安全收紧）。
影响：正确性依赖每个调用点记忆，典型"漏一个就错"。

**A4（P1）UNIQUE 冲突判断散落 9 处字符串匹配**
证据：`files.ts:75/105/153`、`nodes.ts:35/85`、`me.ts:134`、`trash.ts:284`、`uploads.ts:75`、`users.ts:87`。
影响：SQLite 错误消息一旦变化（或迁移驱动）会静默破坏全部重试/映射逻辑。

**A5（P0）配额记账无单一入口**
证据：`assertQuota` / `adjustUsedBytes` 共 9 处调用，跨 `files` / `uploads` / `trash` 三路由；`PUT /upload` 的"校验 → 插入 → 失败回滚 → 记账"完整链路在 `files.ts:96-113` 手工拼装（上周泄漏缺陷的修复现场）。
次要：multipart complete 按**客户端声明的 size** 记账（`uploads.ts:79` 用 `row.size`），未与 R2 实测大小复核——声明值偏小即可少记配额。

**A6（P2）`errors.rateLimited` 定义未使用**（`errors.ts:20`）——死代码，或曾计划的限流残留。

**A7（P1）客户端上传 XHR 的 401 不触发续期**
证据：`client/src/api/uploads.ts` XHR 路径直接抛错；fetch 路径已接 `handleSessionExpired`。
影响：会话中途过期时上传静默失败且不触发重登（与刚修复的白屏属同族问题）。

### B. 客户端结构与稳健性

**B1（P0）`Browser.tsx` ≈560 行**：查询编排、选择、键盘、拖拽、批量操作、6+ 弹窗/浮层、右键菜单、上传面板全部内联；配套测试 ≈550 行，拆分与定位困难。
**B2（P1）`FileList.tsx` ≈530 行**：虚拟滚动、行渲染、拖拽、选择、右键耦合在一个组件。
**B3（P1）`AppShell.tsx` ≈220 行**：QueryClient 工厂 + 缓存错误桥 + 侧栏/头部 + 上传面板 + act-as + 移动端适配。
**B4（P1）`useUploadQueue.ts` ≈260 行**：上传编排（并发、暂停/恢复/重试、指纹续传、限速统计）与 React 状态耦合，只能整页级测试。
**B5（P2）模块级可变状态**：`api/uploads.ts` 的 `smallFileLimit` 全局变量由 `AppShell` 副作用写入（`setUploadLimits`），初始化顺序隐式耦合。
**B6（P0）无错误边界**：全库 grep 无 `ErrorBoundary` / `componentDidCatch` / `errorElement`——任何渲染异常 = 整页白屏，与近期两次空白页事件同族。
**B7（P2）批量分块 100 与服务端 `MAX_IDS=500` 是隐式配合**（`useBatchOps` 仅注释说明），单边调整易脱节。

### C. 工程与运维

**C1（P0）CI 触发分支错误**：`ci.yml` push 仅监听 `branches: [main]`，而仓库默认分支是 `master`——**push 从未触发过 CI**，守卫只覆盖 PR。
**C2（P2）cron 观测薄弱**：`purgeExpiredTrash` 失败用裸 `console.warn`（`trash.ts:236`）非结构化；四任务均无成功路径记录（删了多少、校准了多少行）。
**C3（P2）`client/dist/index.html` 是刻意保留的占位产物**（`.gitignore` 白名单），但内容指向已不存在的 hash 资源，直接访问 :8787 且未 build 时页面损坏。维持现状即可（勿删：wrangler dev 需要该目录存在），补一行 README 说明。
**C4（P2）部署无回滚清单**：手动 `npm run deploy` 合理，但缺"发布前检查 + 回滚步骤"文档。
**C5（P2）`npm run check` 不含 `format:check`**（CI 亦不含）——格式漂移无守卫（决策项）。

### D. 文档债

**D1（P1）设计稿已过时且未标注**：OIDC / 会话 / WebDAV 章节与现状不符，对新人误导。
**D2（P2）缺文档索引**：specs/plans/reports 及"为什么这样设计"没有汇总入口。

## 4. 重构原则

1. **特征测试先行**：动结构前先补行为快照（现有 330 用例是护城河）。
2. **单一归属**：跨切面规则只允许存在于 `server/lib/*` 与 `client/src/lib/*`，路由与组件只做编排。
3. **拆分不重写**：组件 / hook 拆分保持 props、副作用与导出语义不变，先搬后简。
4. **原子提交**：一个可独立验证的改动一个提交（中文 conventional；纯结构 = `refactor`，语义修正 = `fix` 并显式标注）。
5. **每步可部署、可中止**：任意 Phase 结束时 master 必须绿。
6. **反过度设计**：新增 lib 模块必须有 ≥2 个现有调用方；不引入新依赖层次。

## 5. 分阶段方案

### Phase 0 — 零风险修补（0.5 天，3–4 提交）

| # | 改动 | 文件 | 验收 |
| --- | --- | --- | --- |
| 0.1 | CI 触发分支修正（C1）：`branches: [main]` → `[main, master]` | `.github/workflows/ci.yml` | push 到 master 出现 Actions 运行记录 |
| 0.2 | ErrorBoundary（B6）：类组件降级页（说明 + 「重新加载」按钮 + 错误详情折叠），挂载 `App` 顶层与路由层 | 新增 `client/src/components/ErrorBoundary.tsx`、`App.tsx` | 渲染抛错时代替白屏；新增 RTL 用例 |
| 0.3 | 上传 XHR 401 接入续期（A7）：检测 401 → 调 `handleSessionExpired`（复用 10s 守卫），队列项标记为"会话已过期"而非泛化失败 | `client/src/api/uploads.ts` | 新增单测：XHR 401 触发续期且不刷新风暴 |
| 0.4 | 删除 `errors.rateLimited` 死代码（A6）：需要限流时按未来需求重新设计 | `server/lib/errors.ts` | 全量测试绿 |

风险≈0；0.3 与既有续期守卫（`RENEW_GUARD_MS`）协同，不会产生刷新循环。

### Phase 1 — 服务端规则收敛（1–1.5 天，5 提交）

**1.1（A1/A2/A4）新增 `server/lib/d1.ts`**
- `chunk`、`placeholders(n)`、`isUniqueViolation(e)`、`SQL_PARAM_BATCH = 90`、`SUBTREE_ROOTS_PER_STMT = 30`（注释写明推导：D1 单语句 100 上限、每根 3 参数）
- 全量替换 `trash.ts`（8 处分片 + 3 处拼接）、`search.ts`、`nodes.ts` 调用点；删除 `trash.ts` 的 `chunk` 导出与跨路由 import
- 验收：grep 确认 `server/routes/**` 不再出现 `"?").join` 与裸分片字面量

**1.2（A2）新增 `server/lib/ids.ts` 与 `server/lib/constants.ts`**
- `parseIds`（含 `MAX_IDS = 500`）自 `routes/trash.ts` 迁出；`files` / `shares` / `trash` 改引用
- `PART_SIZE`、`ORPHAN_GRACE_MS` 迁至 `constants.ts`（`me.ts` 等同步引用）

**1.3（A3）`deleted_at` 语义收紧（行为修正，单独提交 + 新测试）**
- 新增 `getLiveNode` 与 `requireLiveDir`（解析父 + `is_dir` + 活跃，一条链）
- 替换：`dirs.ts` 两端点、`uploads.ts` init、`files.ts` PATCH、`files.ts GET /:id/content`、`shares.ts`（删手工检查）
- 保留 `getNode`：`restoreTrashNode`、`permanentDelete*`、`moveMany` 内部（需要软删行）
- 测试：向已删除目录建目录/上传 → 404；重命名/下载已删节点 → 404；回收站还原/彻底删除回归

**1.4（A5）新增 `server/lib/quota.ts`**
- `assertQuota` / `adjustUsedBytes` 自 `nodes.ts` 迁出（nodes 专职树结构）
- 新增 `registerUploadedObject(env, {...})`：封装"配额校验 → 插入（UNIQUE 改名重试）→ 失败删对象回滚 → 记账"，供 `files.ts PUT` 与 `uploads.ts complete` 共用；`insert` 成功后的记账异常不回滚（沿用现有语义，注释写明）
- 安全边界显式化：回滚仅针对**本次请求新写入的对象**；秒传路径复用既有 key，接口设计上不允许回滚（参数区分），避免误删共享对象

**1.5（A5）multipart 按 R2 实测大小记账（行为修正，单独提交）**
- complete 时 `BUCKET.head(key)` 取实测 size，用于节点 size、配额校验与记账；对象缺失 → 400 且不登记
- 测试：声明 size ≠ 实测（偏小）→ 按实测记账；对象缺失 → 拒绝

**提交切分建议**：
1. `refactor(server): D1 参数分片与约束判断收敛到 lib/d1`
2. `refactor(server): ids 校验与共享常量迁出路由模块`
3. `fix(server): 已删除节点不可再作为写/读操作目标`
4. `refactor(server): 上传落库与配额记账收口到 lib/quota`
5. `fix(server): multipart 完成改按 R2 实测大小记账`

### Phase 2 — 客户端拆分（2–3 天，6 提交）

**2.1（B1）`Browser.tsx` 拆分**（先补 2–3 个交互级测试锁定行为：多选范围、弹窗流转、拖拽移动）
- `hooks/useSelection.ts`：选中集合 + 锚点 + Shift 范围 + 全选/清空
- `hooks/useBrowserDialogs.ts`：弹窗群用 discriminated union reducer 收敛
- `components/BrowserToolbar.tsx`：视图切换 / 筛选 / 新建 / 上传按钮组
- `Browser.tsx` 保留：查询编排 + 布局 + 组合。目标 ≤250 行

**2.2（B2）`FileList.tsx` 拆分**
- 抽出 `components/FileRow.tsx`（行渲染 + 行内操作 + 右键）；虚拟滚动与列表容器留在 `FileList`
- `RowAction` 导出路径与组件 props 不变。目标 `FileList` ≤300 / `FileRow` ≤200

**2.3（B3）`AppShell.tsx` 拆分**
- `api/queryClient.ts`（`makeQueryClient` + 缓存错误桥）、`shell/AppHeader.tsx`、`shell/ActAsMenu.tsx`
- `AppShell` 只留布局与 session 检查。目标 ≤150 行

**2.4（B4）上传引擎提取**
- `lib/upload-engine.ts`：纯 TS 类（addFiles / start / pause / resume / retry / remove / clear + 订阅；api 依赖注入便于单测）
- `useUploadQueue` 变薄封装（订阅 + useState 镜像）；现有 279 行测试拆为引擎单测 + hook 集成测。目标 hook ≤140 行

**2.5（B5）`api/uploads.ts` 拆分**
- limit 全局态 → `lib/upload-config.ts`（含写入时机注释）；底层 XHR 工具单独文件。目标各 ≤150 行

**2.6（B7）批量分块注释交叉引用**：`useBatchOps` 分块常量旁注明 `server/lib/ids.ts MAX_IDS` 的配对关系；不引入协商协议

所有子项保持组件对外 props / API types 不变；每子项独立提交、独立跑测。

### Phase 3 — 工程与运维（0.5–1 天，2–3 提交）

- **3.1（C1 增强 / C5）CI**：将 `npm run predeploy`（Access 配置校验）纳入 CI；决策 `format:check` 是否纳入（若纳入，先 `npm run format` 大扫除单独提交）
- **3.2（C2）cron 观测**：四任务统一结构化日志（`lib/logger` 增无请求上下文的 emit，上收 `users.ts` 的 `structuredWarn`），记录开始/结束/计数/失败明细
- **3.3（C4）发布与回滚清单**：README 或 docs 增补（部署前 health 检查、构建 hash、线上最小漫游清单、回滚 = `wrangler rollback` 或重部署上一提交）
- **3.4（决策）自动部署 workflow**：默认不做；需要时另立方案

### Phase 4 — 文档收敛（0.5 天，1–2 提交）

- **4.1（D1）** 历史稿标注：`specs/2026-09-27-*` 顶部加"历史稿，现状以 README 为准"横幅并修正失效引用
- **4.2（D2 / C3）** `docs/README.md` 索引页：specs / plans / reports / 本方案的关系与阅读顺序；顺带一行说明 `client/dist/index.html` 占位用途
- **4.3** 本方案回填执行结果并归档

## 6. 验证与验收

**每阶段通用**
- `npm test`（330+ 用例）全绿；`npm run check` 零告警；`npm run build` 成功
- 部署后手动漫游：登录 → 续期（清 Access cookie 重开）→ 上传三通道（>60MB 分片、断点续传、秒传）→ 批量操作（1/49/50/100/500 项）→ 配额边界（拒绝后 R2 无残留）→ 回收站（删/还原/过期）→ 分享（密码/过期/计数）→ 搜索 → act-as → PWA 离线
  （此清单同时沉淀进 3.3 的发布文档）

**阶段特定**
- P0：push 触发 CI 成功；ErrorBoundary / XHR 401 用例入测
- P1：grep 验收（routes 层分片字面量清零）；新增行为用例（deleted 目标、multipart 实测）全绿
- P2：行数目标达成；组件测试与拆分前断言等价（不删断言降覆盖率）
- P3：`wrangler tail` 观察一次 cron 日志（或本地触发）可读

## 7. 风险与回退

| 风险 | 缓解 |
| --- | --- |
| 语义修正引入行为漂移（1.3 / 1.5） | 独立提交 + 专属测试；commit 消息显式 `fix` 标注；上线后按漫游清单覆盖 |
| 拆分期间并行功能开发冲突 | 每 Phase 结束即稳定；2.x 各子项互不阻塞 |
| 过度抽象 | 原则 6；lib 新模块先证明 ≥2 个调用方 |
| 旧 SW 设备缓存 | 已由 denylist + `*` 兜底解决，本方案不动 SW 逻辑 |
| Windows Miniflare EBUSY 噪音 | 已知假噪音，不影响判定 |

## 8. 里程碑汇总

| Phase | 内容 | 预估 | 提交数 |
| --- | --- | --- | --- |
| 0 | 零风险修补 | 0.5d | 3–4 |
| 1 | 服务端规则收敛 | 1–1.5d | 5 |
| 2 | 客户端拆分 | 2–3d | 6 |
| 3 | 工程与运维 | 0.5–1d | 2–3 |
| 4 | 文档收敛 | 0.5d | 1–2 |
| **合计** | | **≈5–6 人天** | **17–20** |

## 附录 A：问题 → Phase 对照

| 编号 | 问题 | 优先级 | Phase |
| --- | --- | --- | --- |
| A1 | D1 分片规则散落 | P0 | 1.1 |
| A2 | 路由跨模块导入 | P0 | 1.1 / 1.2 |
| A3 | `deleted_at` 语义靠自觉 | P0 | 1.3 |
| A4 | UNIQUE 字符串判断 9 处 | P1 | 1.1 |
| A5 | 配额记账无入口 + multipart 声明 size | P0 | 1.4 / 1.5 |
| A6 | `rateLimited` 死代码 | P2 | 0.4 |
| A7 | 上传 XHR 401 不续期 | P1 | 0.3 |
| B1 | `Browser.tsx` ≈560 行 | P0 | 2.1 |
| B2 | `FileList.tsx` ≈530 行 | P1 | 2.2 |
| B3 | `AppShell.tsx` ≈220 行 | P1 | 2.3 |
| B4 | `useUploadQueue.ts` ≈260 行 | P1 | 2.4 |
| B5 | `smallFileLimit` 全局态 | P2 | 2.5 |
| B6 | 无错误边界 | P0 | 0.2 |
| B7 | 批量分块隐式配合 | P2 | 2.6 |
| C1 | CI 触发分支错误 | P0 | 0.1 / 3.1 |
| C2 | cron 观测薄弱 | P2 | 3.2 |
| C3 | `dist` 占位产物 | P2 | 4.2 |
| C4 | 部署无回滚清单 | P2 | 3.3 |
| C5 | `format:check` 未纳入守卫 | P2 | 3.1 |
| D1 | 设计稿过时 | P1 | 4.1 |
| D2 | 缺文档索引 | P2 | 4.2 |

## 附录 B：待确认决策项

1. `GET /:id/content` 对已删节点收紧为 404（已核实客户端回收站无预览依赖；未来若加回收站预览需另立接口或显式豁免）
2. multipart 声明与实际不一致时**按实测记账**（建议）而非拒绝——是否需要附加告警
3. `format:check` 是否纳入 `check` / CI
4. 是否上自动部署 workflow（默认否）

