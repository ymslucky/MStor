# v2 生产切换清单（多租户 schema 2.0）

> 适用：把 `feat/v2-tenancy` 合入 `master` 并部署到 `stor.msxor.com`。
> **这次切换是破坏性的**：`migrations/0016_v2_rebuild.sql` 会 DROP `users` / `nodes` / `shares` / `uploads` / `orphan_objects` / `settings`，然后按多租户模型重建。
> 前提假设（方案 D-b）：现网只有测试数据，可以清空。

## 0. 顺序为什么不能错

Cloudflare 的自动构建只跑 `npm run deploy`（`vite build && wrangler deploy`），**不会执行 D1 迁移**。
新代码的每条 SQL 都带 `workspace_id`，而旧库没有该列 → 反向顺序（先部署、后迁移）会让**每一个 API 都 500**。

正确顺序：**先把结构迁到 2.0，再让新代码上线**；两次操作之间的窗口里，旧代码同样会 500，所以窗口越短越好（建议先暂停自动部署）。

## 1. 迁移前（本地/任意有凭据的终端）

```bash
# 1) 逻辑备份（Time Travel 之外的双保险）
npx wrangler d1 export mstor --remote --output backup-before-v2.sql

# 2) 干跑确认迁移链与全量建库等价（不需要任何凭据）
npm run check:migrations   # 期望：✅ 迁移链与 sql/schema.sql 完全等价

# 3) 应用迁移到远程 D1（会清空数据）
npx wrangler d1 migrations list  mstor --remote
npx wrangler d1 migrations apply mstor --remote
```

## 2. 部署前必须改的一处配置

`wrangler.jsonc` 里 `ACCESS_PROVISION` 目前是 `"off"`。清库后 `users` 表为空，而 `off` 意味着**未知身份一律 403**——没人能登录，第一个管理员也建不出来。

```jsonc
"ACCESS_PROVISION": "on",   // 允许 Access 放行的身份自动建号；首个登录者成为平台管理员
```

Access 侧的 Allow 白名单仍是唯一的准入边界，所以 `on` 不等于"对外开放"。

## 3. 部署

- 若由 Cloudflare 自动部署：确认 GitHub 合并到 `master` 后自动构建的**构建命令是 `npm run deploy`**（`predeploy` 会先校验 Access 配置）。
- 手动部署：`npm run deploy`（等价于 `vite build && wrangler deploy`）。

## 4. 部署后确认（生产）

1. 用**你自己的 GitHub 账号**首次登录 → 应自动建号并成为 `platform_admin`（`/api/me` 返回 `role: "admin"`）。
2. 侧栏应出现"我的空间"，说明 `ensurePersonalWorkspace` + 根哨兵已建立。
3. 上传一个小文件 → 列表出现、下载字节一致、`/api/me.storage.activeBytes` 增长。
4. 新建分享（可设一次性）→ 隐身窗口打开链接 → 下载一次后再开应 410。
5. 设置页「成员」标签发邀请 → 用第二个 Access 身份登录 → 自动加入并收到站内通知。
6. 设置页「管理」标签能看到平台概览（用户/空间/存储/审计）。

## 5. 回滚

- 代码：`npx wrangler rollback`（回到上一版本）或 `git revert` 后重新部署。
- 数据：D1 的 Time Travel 保留 30 天，可在控制台按时间点恢复；本地另有 `backup-before-v2.sql` 可 `wrangler d1 execute --file` 回灌（**注意**：回灌会把 2.0 结构覆盖回 1.x）。
- R2 对象不会被迁移删除，但清库后它们变成无行引用的孤儿（仍计费、界面上不可见）。确认要彻底重来时可另行清理桶。

## 6. 已知限制（本版不带）

- 版本管理（`file_versions` 表保留但功能未启用）。
- 网格/时间线的缩略图**渲染**（服务端与上传链路已就绪，UI 未接）。
- PDF.js / Office 预览矩阵。
- 邮件通知（仅站内通知）。
