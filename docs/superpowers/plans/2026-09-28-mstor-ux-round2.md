# MStor UX 改进第二轮（2026-09-28）

用户反馈 5 项体验问题，逐项修复。延续 TDD + 每任务 commit。

## 任务清单

### A. 删除弹窗支持「彻底删除」
- A1 `client/src/api/nodes.ts`：新增 `deleteNodePermanently(id)` = deleteNode → purgeNode 两连调（purge 仅对软删态生效）。测试 `client/src/api/nodes.test.ts`。
- A2 `ConfirmDialog`：新增 `extraAction?: { label; busy?; onClick }`，footer 第三个按钮。
- A3 `Browser.tsx`：单项/批量删除弹窗加「彻底删除」；完成后失效 files/trash/me；toast 结果。

### B. 分享页批量管理
- B1 服务端 `POST /api/shares/batch-revoke`（ids 1-500，owner 作用域 UPDATE，返回 `{ok, revoked, failed}`）。测试 `test/shares.test.ts`。
- B2 `client/src/api/shares.ts` 加 `batchRevokeShares`；`SharesPage.tsx` 加 checkbox 多选 + 全选 + 底部操作条 + 确认弹窗。

### C. 分享默认 7 天
- `ShareDialog.tsx`：days 默认 `"7"`，文案「默认 7 天，清空永久」。创建后不可改维持现状（无编辑端点，天然满足）。

### D. 用户改名 + 角色分配
- D1 服务端 `PATCH /api/me/admin/users/:id` 支持 `name`（trim 后 1-64 字符）。测试 `test/me.test.ts`。
- D2 `client/src/api/me.ts` patchAdminUser 加 `name`；`SettingsPage.tsx` AdminRow：改名（NameDialog）+ 角色 select（self 禁用，server 兜底）+ onError toast。

### E. 上传进度 + 网速
- E1 `client/src/lib/speed.ts`：`SpeedTracker`（EMA 速度采样器）。测试 `speed.test.ts`。
- E2 `uploads.ts`：`uploadSmall` 改 XHR（upload.onprogress + signal abort + x-act-as 头 + ApiError 对齐）。测试 `uploads.test.ts` 加 XHR mock 用例。
- E3 `useUploadQueue.ts`：QueueItem 加 `speed`；进度回调节流 100ms；EMA 采样；小文件传 signal/onProgress；完成/失败清理采样器。
- E4 `UploadPanel.tsx`：进行中项显示 `xx/s`；面板头部显示合计速度。

## 执行记录

| 任务 | Commit | 测试 | 状态 |
| --- | --- | --- | --- |
| 计划 | 5908bd0 | - | 完成 |
| A 删除弹窗彻底删除 | 261834c | client nodes 2/2 | 完成 |
| B 分享批量撤销（B1 端点 + B2 UI） | b02025e | shares 10/10（新增 3） | 完成 |
| C 分享默认 7 天 | b02025e | ShareDialog 2/2（更新默认断言） | 完成 |
| D 用户改名+角色分配 | 57ccee5 | me 17/17（新增 4） | 完成 |
| E 上传进度+网速 | 4a4bbdc | client 134/134（speed 5 + uploads XHR 5 + queue 1 新增） | 完成 |

## 回归结果（2026-09-28）

- server vitest：117/117（+7 新用例）
- client vitest：134/134（+13 新用例）
- tsc server + client：0 错误
- vite build + PWA：正常（precache 7 entries, 450.71 KiB）
