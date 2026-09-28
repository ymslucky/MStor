# MStor P0 功能升级 + 缩略图 + UX 优化实施计划

> 日期：2026-09-28 ｜ 基线：master `4c25ede`（生产 30f28995）
> 范围：P0×3（断点续传 / 秒传 / 分享增强）+ 缩略图 + UX 三项。其他项明确不做。
> 流程：每任务 TDD → 全量回归 → 部署（先 d1 migrations 再 wrangler deploy）→ push。

## 环境事实（必读）

- 测试：server `npx vitest run`（现 121）；client `npm run test:client`（现 144）；tsc 双管线 `npm run check`。需要 dangerouslyDisableSandbox（wrangler 日志沙箱噪音属正常）。
- D1 迁移：`migrations/000X_*.sql`，测试 setup 自动应用（test/setup.ts applyD1Migrations）；远程 `npx wrangler d1 migrations apply mstor --remote`。
- 关键代码位置：
  - 大文件上传：`client/src/api/uploads.ts`（uploadLarge/putPartWithRetry/putPart XHR）、`client/src/hooks/useUploadQueue.ts`（drain 多 worker、cancel 调 abortUpload）
  - server multipart：`server/routes/uploads.ts`（init/part-urls/complete/abort，预签名 URL）
  - 删除/引用：`server/routes/trash.ts` permanentDeleteNode（先删 BUCKET 再删行）、`server/lib/nodes.ts`
  - 分享：`client/src/components/ShareDialog.tsx`、`client/src/pages/SharesPage.tsx`、`server/routes/shares.ts`
  - 缩略图相关：`server/lib/serve.ts`（content 响应头）、`client/src/components/FileList.tsx`（网格视图 NodeIcon 占位）
  - 错误处理：`client/src/api/client.ts`（ApiError）
- 本地偏好：`client/src/lib/settings.ts`（getUploadConcurrency 等，localStorage）
- 测试注意：client 模块级 mock 跨用例累积，需 `beforeEach(() => vi.clearAllMocks())`；FakePartXhr 在 uploads.test.ts。

## T1 断点续传（暂停/刷新后恢复大文件上传）

语义：暂停/失败**不再清理服务端分片**；按文件指纹自动续传；仅「取消并清理」才 abort。

1. `client/src/lib/resume.ts`（新）：指纹 `${name}:${size}:${file.lastModified}:${parentId}`（可 hash 缩短）。存 localStorage key `mstor_resume`（JSON map）：`{ [fingerprint]: { uploadId, name, parentId, parts: [{partNumber, etag}], done: number, ts } }`，最多保留 20 条（LRU by ts）。API：`loadResume(fp)` / `saveResume(fp, rec)` / `clearResume(fp)` / `listResumes()`。
2. `uploads.ts` uploadLarge opts 加 `resume?: { uploadId: string; parts: Part[] }` 与 `onResumeStart?`：
   - 有 resume：不再调 init；totalParts 同公式（用 file.size / partSize——partSize 从已传分片推断不可靠，改为 resume 记录里存 partSize）。
   - worker 跳过 `parts` 里已有 partNumber；complete 时 parts = 已传 + 新传 合并。
   - 进度基数：初始 ratio = 已传分片字节 / size。
3. `useUploadQueue.ts`：
   - drain 中 uploadLarge 传入 `resume: loadResume(fp)`（有则用，onUploadId/每分片完成时 saveResume 更新 parts）。
   - 成功 → clearResume(fp)。
   - cancel：大文件**不调** abortUpload，改 saveResume（uploadId + parts）；UI 文案「已暂停」。新增错误项操作「彻底取消」→ abortUpload + clearResume（UploadPanel 需要加按钮）。
   - 失败（非取消）同样 saveResume，retry 自动续传。
   - QueueItem 加 `fingerprint` 与 `paused` 语义（status 仍用 error+error:"已暂停" 或加 "paused" 状态——用 status:"paused" 更清晰，UploadPanel/测试适配）。
4. 测试：resume.ts 单测；uploads.test.ts「resume 跳过已传分片：4 分片传 2 后恢复，只传 2 个新分片，complete parts=4」；queue 测试「cancel 大文件不调 abortUpload 且记录 resume」「retry 续传」。

## T2 秒传（≤60MB，SHA-256 去重）

1. migration `0004_nodes_sha256.sql`：`ALTER TABLE nodes ADD COLUMN sha256 TEXT;` + `CREATE INDEX idx_nodes_sha256 ON nodes(sha256);`
2. server `uploads.ts` init 请求加 `sha256?: string`（64 hex 校验）：命中 `SELECT id, r2_key, size, mime FROM nodes WHERE sha256 = ?1 AND deleted_at IS NULL AND is_dir = 0 LIMIT 1` 且 size 完全相等 → 直接建 node（复制 r2_key，uniqueName 处理重名，配额校验 usedBytes+size ≤ quota）返回 `{ nodeId, name, deduplicated: true }`（201）；未命中走原 multipart。
3. server complete 时写入 sha256（init 存内存不行——multipart init 落库吗？现实现 init 只算 partSize 不落库？读代码确认：init 存了 uploadId→哪来的表？很可能 uploads 用 R2 multipart + 无 D1 记录，part-urls 现算。则 complete 请求体加 sha256 透传写入 nodes）。同时 R2 PUT 小文件路径（files.ts 直传）也写 sha256（直传没法预知 hash——只对 multipart/秒传路径写；小文件直传后不补算，接受）。
4. 引用计数：`permanentDeleteNode` 删 BUCKET 前 `SELECT 1 FROM nodes WHERE r2_key = ? AND id != ? LIMIT 1`，有引用跳过 delete。
5. client：上传前对 ≤60MB 文件 `crypto.subtle.digest('SHA-256', await file.arrayBuffer())` 转 hex；进 uploadSmall？小文件直传路径也要秒传——统一：≤60MB 走 `/api/files/upload` 直传。秒传只挂在 uploads(multipart) 就覆盖不到小文件。方案：files.ts 直传端点也加 `x-file-sha256` header 查重逻辑（命中返回 deduplicated node，不收 body——XHR 已发 body 无法避免，但服务端不写 R2 直接建 node）。实现：PUT /api/files/upload 带 header `x-file-sha256`：命中且 size 相等 → 建 node 返回（忽略 body）。client uploadSmall 加 hash header。
   - hash 计算放 worker 循环前（useUploadQueue add 后 drain 中，≤60MB 才算，失败忽略 header 不带）。
6. 测试：server「同 hash 同 size 二次直传返回 deduplicated 且 R2 无新对象」「size 不等不命中」「删除有引用对象不删 BUCKET」（mock env.BUCKET）；client「uploadSmall 带 sha256 header」。

## T3 分享增强（二维码 + 过期标记）

1. `ShareDialog` 成功态加二维码（引入 `uqr` 零依赖小包：`encodeSVG` 生成 data URL 显示；若无网络装包则手写 QR 不可行——npm i uqr）。显示 96px SVG + 「复制链接」。
2. `SharesPage`：`expires_at < now` 显示「已过期」灰标（点击打开仍 410，纯展示）；hover 行显示下载计数（已有）。
3. server 不改（list 已含 expires_at）。
4. 测试：client ShareDialog 渲染二维码 svg；SharesPage 过期标记。

## T4 缩略图（免费近似：原图 + 强缓存 + 懒加载；付费 Image Resizing 后续可切）

1. `server/lib/serve.ts` content 响应：`image/*` 加 `Cache-Control: public, max-age=31536000, immutable`（公开分享与登录内容一致）；其余不变。
2. `FileList` 网格视图：`image/*` 且有缩略图需求时用 `<img loading="lazy" decoding="async" src={contentUrl(id)} className="h-full w-full object-cover">` 替换 NodeIcon（外层 rounded-xl overflow-hidden）。列表视图保持图标（行高 48 不适合图）。
3. 说明：Cloudflare Image Resizing（真缩略图）需付费计划，代码预留：serve.ts 可加 `cf: { image: { width: 256, fit: "cover" } }` fetch 选项常量，注释标明开启条件。
4. 测试：server image content 带 immutable 头；client 网格 image 渲染 img。

## T5 UX 三项（用户报告第二节可落地项）

1. **错误文案映射**：`client.ts` ApiError 构造处加 code→文案映射（RATE_LIMITED→「操作过于频繁，请稍后再试」、R2/E5xx→「服务暂时不可用，请稍后重试」、NOT_FOUND→「文件不存在或已被删除」等），保留原始 code。
2. **批量操作进度**：Browser runBatchDelete/runBatchMove 等改为可感知进度：操作条显示「处理中 i/n」；完成 toast。用 state `batchProgress: {done, total}`。
3. **移动端上传面板 safe-area**：UploadPanel 底部定位加 `env(safe-area-inset-bottom)` padding（检查现况后补齐）；面板高度移动端折叠为单行摘要。
4. 测试：client.ts 映射单测；Browser 批量进度断言。

## T6 收尾

1. 全量回归（server/client/tsc/build）→ commit 各任务 → d1 migrations apply 0004 → deploy → push。
2. 更新 docs/reports 两份报告：P0/缩略图移入「已完成」，UX 问题 3 项移入已完成，度量表更新。
3. 报告最终摘要给用户（含 T4 说明：真缩略图需 Cloudflare 付费 Image Resizing，当前为原图强缓存 + 懒加载近似方案）。

## 验收清单

- [ ] 传大文件 → 暂停 → 恢复只传剩余分片；刷新页面重传同文件自动续传；「彻底取消」清理服务端分片
- [ ] 同一小文件传第二次瞬间完成（秒传），配额正确增加；删除副本后原文件下载不受影响；两份都删后 R2 对象被清
- [ ] 分享弹窗显示二维码；分享列表过期项有灰标
- [ ] 网格视图图片直接显示缩略图；image content 响应带 immutable
- [ ] 错误 toast 为友好文案；批量删除显示 n/m 进度
- [ ] 回归全绿（server ≥130 / client ≥155 预期）+ 部署成功
