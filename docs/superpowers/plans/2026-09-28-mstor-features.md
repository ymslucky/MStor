# MStor 功能补遗：嵌套文件夹上传 + 回收站批量管理

日期：2026-09-28 ｜ 分支：master ｜ 流程：TDD，每任务一 commit

## 背景

- 上传现状：`Browser.tsx` 的 `dropHasDirectory` 把文件夹拖入直接拒绝（toast「请压缩后上传」）；`useUploadQueue.add(File[], parentId)` 只支持平铺文件。
- 回收站现状：服务端仅单项 `POST /api/trash/:id/restore` 与 `DELETE /api/trash/:id`；`TrashPage` 无选择/批量能力。

## 功能 A：嵌套文件夹上传

### A1 服务端：`POST /api/dirs/ensure`（幂等建目录）

嵌套上传需逐级建目录，同一目录会被多个文件触发；普通 `POST /api/dirs` 对同名目录返回 409，无法复用。

- 契约：body `{ parentId?: string; name: string }` → `200` 已存在同名**活跃**目录（返回该行）／`201` 新建。
- 实现（`server/routes/dirs.ts`）：
  1. `validateNodeName` + parentId 存在性校验（与 `POST /` 一致）。
  2. 查 `SELECT * FROM nodes WHERE owner_id=? AND parent_id=? AND name=? AND is_dir=1 AND deleted_at IS NULL`，命中直接 200 返回。
  3. 未命中 → `createDir(db, ownerId, parentId, await uniqueName(...))`：回收站中残留同名目录会挡 UNIQUE 约束，`uniqueName`（不滤 deleted_at）自动让位 `name (2)`。
- 客户端 API：`client/src/api/nodes.ts` 增 `ensureDir(body)`。
- 测试（`test/dirs.test.ts` 或新增 `test/dirs-ensure.test.ts`）：
  - 首次 ensure → 201；再次 ensure → 200 同 id，目录不重复。
  - 回收站有同名已删目录 → 新建 `d (2)`。
  - parentId 不存在/非目录 → 404；空名 → 400。

### A2 客户端：目录树采集 `lib/dirscan.ts`

- `collectUploads(dt: DataTransfer | null): Promise<PendingUpload[]>`，`PendingUpload = { file: File; path?: string }`（path 为相对上传根的路径，如 `photos/2024/a.jpg`）。
- 关键点：
  - **同步**先取 `Array.from(dt.items).map(i => i.webkitGetAsEntry?.())`（DataTransfer 在 handler 让出后失效），再异步递归 walk。
  - `FileSystemDirectoryReader.readEntries()` 单次最多返回 100 条，必须循环到空批。
  - 无 entries（浏览器不支持/纯文件）→ 回退 `dt.files`（path 省略）。
  - 顶层文件 path = 文件名本身 → 段列表为空 → 不建目录；目录内文件 path 前缀 `dir/`。
- 测试（`client/src/lib/dirscan.test.ts`）：纯文件、单层目录、嵌套目录、混合拖入、readEntries 分批、无 items 回退 files。

### A3 客户端：队列支持路径 `useUploadQueue`

- `QueueItem` 增 `path?: string`；`add(items: (File | PendingUpload)[], parentId)`（兼容现有 `File[]` 调用）。
- drain 中上传前解析目标目录 `ensureDirs(parentId, path)`：
  - 按 `path.split("/").slice(0, -1)` 逐段 `ensureDir`，**顺序** await（父子依赖）。
  - `dirCache: Map<"parentId/seg", Promise<string>>` 缓存目录 id，同目录多文件只建一次；失败的 promise 从缓存剔除。
- `UploadPanel` 显示 `it.path ?? it.name`。
- 测试：带 path 上传先 ensureDir 再 uploadSmall；同目录两文件 ensureDir 仅一次；无 path 行为不变（回归现有 7 个用例）。

### A4 客户端：Browser 集成

- drop 处理：`collectUploads(e.dataTransfer)` 替换 `dropHasDirectory` 拒绝逻辑；有空结果不 toast（纯目录空文件夹给「该文件夹为空」提示）。
- 新增文件夹选择入口：隐藏 `<input webkitdirectory multiple>`（`webkitRelativePath` 作 path），工具栏加 `FolderUp` IconButton「上传文件夹」，空目录 CTA 加 ghost 按钮。
- 覆盖层文案不变。更新既有用例「dropping a directory entry is ignored with toast」→ 改为递归采集后入队。

## 功能 B：回收站批量管理

### B1 服务端：批量端点

从单项 restore 路由提取 `restoreTrashNode(db, ownerId, id)`（行为不变），新增：

- `POST /api/trash/batch-restore` body `{ ids: string[] }` → 逐项 try/catch，返回 `{ ok: true, restored: number, failed: { id: string; reason: string }[] }`（单项 409/404 不阻断其余）。
- `POST /api/trash/batch-purge` body `{ ids: string[] }` → 逐项 `permanentDeleteNode`；404 视为已清除（同批父目录先删导致子节点消失），返回 `{ ok: true, purged: number, failed: [...] }`。
- 校验：`ids` 非空字符串数组、≤500 → 否则 400。
- 测试：批量还原全部成功/部分失败计数；批量清除 R2 对象与 shares 一并删除、子节点随后 404 容忍；参数校验 400。

### B2 客户端：API + TrashPage 批量 UI

- `api/trash.ts` 增 `batchRestore(ids)` / `batchPurge(ids)`。
- `TrashPage`：
  - `useFileSelection` + `FileList selectable`（行首 checkbox、表头全选）。
  - 选中 ≥1 → 底部批量条：还原 / 彻底删除（均 ConfirmDialog，purge danger）/ 取消；busy 态；完成清空选择并失效 trash/files/me。
  - 页头「清空回收站」按钮（列表非空时显示）→ danger ConfirmDialog → `batchPurge(全部 id)`。
- 测试：勾选后批量还原调 batchRestore；批量彻底删除需确认；清空回收站用全量 id；单项操作回归不变。

## 验证

1. `npm run test:server` / `npm run test:client` 全绿。
2. `npm run check`（双 tsc）零错误。
3. `npm run build` 成功。
4. 部署 `npx wrangler deploy`（需 dangerouslyDisableSandbox），线上冒烟：拖入含子目录文件夹 → 目录树与文件落位正确；回收站勾选批量还原/彻底删除、清空。

## 执行记录

| 任务 | commit | 测试 | 备注 |
|---|---|---|---|
| A1 ensure 端点 | 155ef70 | 4/4 | 含回收站残留同名让位 `d (2)` 用例 |
| A2 dirscan | fd09114 | 6/6 | 假 reader 需先自增再回调（同步递归陷阱） |
| A3 队列 path | 2c73d93 | 10/10 | 目录 id Promise 缓存 + 失败剔除 |
| A4 Browser 集成 | 608dcf2 | 31/31 | webkitdirectory 入口 + 空文件夹 toast |
| B1 批量端点 | 7580c14 | 9/9 | restoreTrashNode 提取复用；404 幂等 |
| B2 TrashPage | a15bfff | 8/8 | 批量条 aria-label 区分行内同名按钮 |

回归：server 110/110，client 121/121，tsc 双管线 0 错，build + PWA 正常。
