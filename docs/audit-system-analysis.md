# 审计体系分析与重构路线

> 范围：审计事件模型、写入边界、覆盖范围、查询/展示、保留与完整性。
> 生产样本：24 条审计记录，其中 14 条 admin.act_as、10 条 invitation.*（2026-10-23）。

## 0. MStor 是否需要审计体系？

需要，但应是**分层的最小审计**，不是把每次文件读取都写一遍。

MStor 已经具备审计的必要条件：

- 多租户 workspace 与跨空间管理员；
- admin 可以 act-as 进入他人空间；
- 邀请/撤销、分享链接、批量删除/彻底删除；
- 配额与成员权限变更；
- 这些操作一旦出问题，需要回答「谁、何时、对什么、结果如何」。

不建议无差别记录：

- 普通文件列表/预览/搜索属于数据面，量大、隐私敏感、排障价值低；
- 记录它们会显著增加 D1 写入与保留成本，也会扩大泄露面；
- 行业做法（CloudTrail Data events / GCP Data Access）也是显式开启、单独保留、按需采样。

建议分层：

| 层级 | 事件 | 策略 |
|---|---|---|
| A 控制面/安全 | 登录、act-as、权限/成员、管理员设置、邀请 | 必记，365 天 |
| B 破坏性/外链 | 删除/彻底删除/还原、分享创建/撤销、下载（可采样） | 必记或采样，90-180 天 |
| C 数据面 | 列表、预览、搜索、普通读取 | 默认不记；合规需要时单独开启 |

所以 MStor **需要审计体系**，但当前应优先补齐 A/B 两层的**动作级**事件、可查询与可保留，而不是做全量访问日志。

## 1. 为什么「以管理员身份进入空间」会有十几条日志

根因是**审计记录写在请求中间件里，而不是动作入口**：

~~~ts
// server/middleware/access.ts（旧）
const actAs = c.req.header("x-act-as");
if (actAs && user.platform_admin === 1) {
  ...
  await recordAudit(..., { action: "admin.act_as", targetId: target.id });
}
~~~

而客户端 api() 在 localStorage 有 actAs 时会**给每个 API 请求都加 x-act-as**：

~~~ts
// client/src/api/client.ts
if (!skipActAs) {
  const actAs = getString(STORAGE_KEYS.actAs);
  if (actAs) headers.set("x-act-as", actAs);
}
~~~

进入空间后一次页面加载会请求 /api/me、文件列表、标签、通知等多个接口，每个请求都命中中间件，于是同一秒产生 4-5 条 admin.act_as。生产 14 条中有多条集中在同一秒，且 actor 与 target 都是当前管理员自己（用户表对 self 也显示了「进入空间」按钮）。

结论：**x-act-as 是读取上下文，不是一次业务动作；审计应记录「进入」这个动作一次**。

本轮修复：

- 新增 POST /api/me/admin/act-as：校验目标用户、记录一次 admin.act_as（含 requestId、targetName），客户端先调用再写入 localStorage；
- 中间件只解析 x-act-as，不再写审计；
- 用户管理里自己那一行不再显示「进入空间」；API 也拒绝 self act-as；
- 新增 admin.user_patch、admin.settings_patch 审计（与业务写同 batch，失败即回滚）；
- 历史 14 条重复日志保留不改写（审计记录不应被删除）。

## 2. 当前审计体系评估

### 2.1 数据模型

audit_events：

| 字段 | 现状 | 评价 |
|---|---|---|
| id | UUID | 可 |
| workspace_id | 可空 | act-as/邀请语境不统一 |
| actor_id | 用户 id | 可 |
| action | 扁平字符串 | 缺分类/严重级/结果 |
| target_id | 目标对象 | 可 |
| meta | JSON 字符串 | 缺 schema，无法查询 |
| request_id | 存在但旧写入未填 | 新写入已填 cf-ray |
| created_at | 毫秒 | 可 |

### 2.2 写入边界

- 旧：act-as 在中间件按请求写；
- invitations 在业务 batch 内写（好）；
- admin 用户/设置原先完全不写（本轮补）；
- 文件删除/重命名/移动、分享撤销、成员角色变更等仍没有审计；
- 没有登录/登出/拒绝访问事件。

### 2.3 查询与展示

- /api/me/admin/overview 固定返回最近 20 条；
- 页面只在客户端过滤这 20 条，没有服务端分页、时间范围、动作/操作者筛选、导出；
- 动作中文映射在客户端，新增 action 容易漏翻（本轮补 invitation.*）。

### 2.4 保留、完整性、告警

- 没有保留期限/归档；
- 没有防篡改（hash chain/digest）；
- 没有高危事件告警或定期复核；
- 审计日志读取权限依赖管理页 admin，未单独审计「查看审计日志」本身。

## 3. 行业权威方案对比

### 3.1 Cloudflare Audit Logs v2

核心字段：

- ActionDescription / ActionType / ActionResult
- ActorEmail / ActorID / ActorIPAddress / ActorType / ActorTokenDetails
- ResourceID / ResourceType / ResourceProduct / ResourceScope
- ActionTimestamp / AuditLogID

可通过 Logpush 输出到 R2/S3/SIEM。  
关键启发：**action + result + actor context + resource** 是审计事件的最小完整单元。

来源：https://developers.cloudflare.com/logs/logpush/logpush-job/datasets/account/audit_logs_v2/

### 3.2 AWS CloudTrail

- 区分 Management events（控制面）、Data events（数据面/高量）、Network activity、Insights；
- 事件包含 eventTime、userIdentity、sourceIPAddress、requestParameters、responseElements、eventID；
- Event history 保留 90 天；长期通过 trail 写入 S3/CloudWatch；
- 支持 log file integrity validation（digest 文件）。

启发：**控制面事件必记，数据面事件按风险选择性记录**；审计日志要可验证完整性。

来源：
- https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-concepts.html
- https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html

### 3.3 Google Cloud Audit Logs

- Admin Activity（控制面，始终开启，默认保留 400 天）
- Data Access（数据面，默认关闭，需显式开启，默认 30 天）
- System Event / Policy Denied
- 日志不可修改，经 Log Router 分流。

启发：**按事件类型分级与保留**，不要把所有读取都塞进审计。

来源：https://cloud.google.com/logging/docs/audit

### 3.4 NIST SP 800-92

强调日志管理策略、日志生命周期、保护、保留、复核与人员职责；审计日志本身也是安全资产。

来源：https://csrc.nist.gov/pubs/sp/800/92/final

## 4. 差距与重构步骤

### Step 1（本轮已完成）

- 修正事件粒度：act-as 一次动作一条；
- self act-as 禁止；
- 补 admin.user_patch / admin.settings_patch；
- 新写入带 request_id（cf-ray）；
- 保持审计写与业务写同 batch 的 fail-closed 语义。

### 功能开关（本轮）

审计不是“开箱即必须常开”的功能，先做成可配置开关：

- settings 全局键 audit_enabled（1/0），默认开启；
- 设置页「审计」分区（仅平台管理员可见）增加审计日志开关；
- 关闭后服务端 auditStmt 直接 no-op，停止新审计写入；
- 历史记录保留，审计页仍可查看；
- 服务端用 30s isolate 缓存读取开关，避免每个请求都查 settings；多 isolate 最多 30s 收敛；
- 开关切换本身仍写一条 admin.settings_patch，保证配置变更可追溯。

### Step 2（模型 v2，已完成）

migration 0018 已增加：

- category：auth / admin / file / share / member / security
- result：success / denied / failed（默认 success）
- severity：info / warn / critical
- resource_type、resource_id
- actor_ip_hash、actor_ua（字段已留，暂未采集）
- 新写入由 auditStmt 按 action 自动推断分类/严重级
- 索引：(actor_id, created_at DESC)、(category, created_at DESC)；既有 (created_at DESC) 保留

旧数据已按 action 前缀回填；生产验证：

- 24 条 admin.act_as → category=security, severity=critical, result=success
- 12 条 invitation.* → category=member, severity=info, result=success

### Step 3（覆盖范围，部分完成）

已完成：

- act-as（一次动作一条）
- admin.user_patch / admin.settings_patch
- invitation.create / revoke / accept
- share.create / share.revoke / share.batch_revoke
- node.delete / node.batch_delete / node.batch_purge
- node.restore / node.batch_restore
- node.move / node.rename / node.copy
- member.role / member.remove

仍未覆盖：

- auth.login / logout / denied
- share.download（可采样）
- 普通文件读取/预览（按分层策略默认不记）
- audit.view / audit.export（审计查看本身）
- 失败/拒绝事件的 result=denied/failed 写入（字段已就绪）

### Step 3（覆盖范围）

优先补控制面/破坏性动作：

- auth.login / auth.logout / auth.denied
- share.create / share.revoke / share.download（下载可采样）
- node.delete / node.restore / node.purge / node.move / node.rename
- member.invite / member.remove / member.role
- admin.act_as / act_as.end
- settings/配额/用户状态变更

不记录：普通读取、列表浏览、预览（除非合规要求；CloudTrail Data events / GCP Data Access 也是显式开启且高成本）。

### Step 4（查询与 UI）

- 服务端分页 + 时间范围 + 动作/操作者/空间筛选；
- 返回 total，支持导出 CSV（管理员）；
- 动作标签/分类/严重级由服务端或共享常量提供，避免客户端漏翻；
- 审计详情展示 actor、target、result、request_id、IP 哈希，不展示敏感正文。

### Step 5（完整性、保留、告警）

- 每日导出到 R2（append-only）或 Cloudflare Logpush；
- 事件 hash chain（prev_hash + event_hash）或每日 digest；提供校验接口；
- 保留策略：控制面 365 天、数据面 90 天（按合规调整），到期归档；
- 高危事件告警：act-as、admin 权限变更、批量删除、分享撤销；
- 定期复核与访问控制：审计查看/导出本身也记录。

## 5. 验收标准

- 同一业务动作只产生一条审计（act-as 回归测试）；
- 控制面事件覆盖 actor/action/result/resource/time/request_id；
- 审计查询支持至少时间范围 + actor/action 过滤与分页；
- 审计写入失败不阻断安全敏感操作（fail closed）；
- 历史日志可导出、可校验、按策略保留。
