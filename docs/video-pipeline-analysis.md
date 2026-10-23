# 视频缩略图与预览方案分析（MStor）

> 目标：分析当前 MStor 的视频缩略图/预览实现，检索行业权威方案，给出可逐步落地的演进路线。
> 结论先行：MStor 当前采用「客户端抽帧 + R2 存缩略图 + 原生 video 播放」的零服务端转码方案，适合私有云盘的低成本/隐私优先定位；与 Cloudflare Stream、Mux、AWS MediaConvert 等托管视频管线相比，差异主要在「全量覆盖、编码兼容、多码率/HLS、已有资产补图、可配置帧选择」。

## 1. 当前实现

### 1.1 缩略图

- 上传成功后由浏览器生成缩略图：
  - 图片：createImageBitmap → Canvas → 256px WebP。
  - 视频：加载 metadata → seek 到中间帧 → Canvas 绘制 → 256px WebP。
- 缩略图通过 POST /api/files/:id/thumb 存到 R2，nodes.thumb_key 记录；
- 网格读取 /api/files/:id/thumb，带 private immutable 缓存；
- 无缩略图的视频：网格用 muted + preload=metadata 的视频首帧 + 播放角标兜底；
- 失败静默，不影响上传主流程。

### 1.2 预览

- 原生 video + controls + Range 请求（R2 range get，服务端 206）；
- 有缩略图时作为 poster；
- preload=metadata、playsInline；
- 编码不支持时显示错误提示并引导下载。
- 服务端不做转码/HLS；MP4/WebM 的编码兼容性由浏览器决定。

## 2. 行业权威方案

### 2.1 Cloudflare Stream（与 MStor 同平台）

Cloudflare Stream 对上传视频做服务端转码，提供按时间点即时生成的缩略图 URL：

- 路径：/thumbnails/thumbnail.jpg?time=1s&height=270&width=480&fit=crop
- 支持 time / height / width / fit（crop、clip、scale、fill）
- 可用 thumbnailTimestampPct 设置默认帧（0.0–1.0）；默认首帧
- 支持 animated GIF 缩略图
- 播放走 Stream 自己的 HLS/自适应码率，而不是 R2 原文件

来源：https://developers.cloudflare.com/stream/viewing-videos/displaying-thumbnails/

### 2.2 Mux

Mux 用 image.mux.com 提供视频图像：

- https://image.mux.com/{PLAYBACK_ID}/thumbnail.{png|jpg|webp}
- 默认取视频中间帧（或资产设置的 thumbnail_time）
- 支持 time / width / height / rotate / fit_mode（preserve、stretch、crop、smartcrop、pad）
- 支持 animated GIF、storyboard（时间轴悬停预览）
- signed playback 下图片也要签名
- 播放走 HLS/多码率

来源：https://www.mux.com/docs/guides/get-images-from-a-video

### 2.3 AWS Elemental MediaConvert

MediaConvert 通过 Frame capture output 生成 JPEG 静帧：

- 在普通 File group 中去掉音频、容器选 No container、视频编码选 Frame capture to JPEG；
- 一个 job 可输出多帧；COMPLETE 事件带 outputFilePaths；
- 需要与常规音视频输出同 job 存在；
- 适合已有 AWS/S3 管线的批量转码，不是按需 URL 生成。

来源：https://docs.aws.amazon.com/mediaconvert/latest/ug/file-group-with-frame-capture-output.html

### 2.4 Google Cloud Transcoder API

Transcoder API 支持生成 sprite sheet（雪碧图）用于时间轴预览，属于服务端转码 job；具体配置在 spriteSheets 中。

来源：https://cloud.google.com/transcoder/docs/concepts/overview

### 2.5 浏览器原生能力

- CanvasRenderingContext2D.drawImage 明确支持 HTMLVideoElement，这是当前客户端抽帧的基础；
- video 元素提供 poster、preload、playsinline、controls，是预览层的最小可靠语义。

来源：
- https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video

## 3. 对比

| 维度 | MStor 当前 | Cloudflare Stream | Mux | MediaConvert | GCP Transcoder |
|---|---|---|---|---|---|
| 缩略图生成 | 浏览器抽帧 | 服务端转码 + 按需 URL | 服务端转码 + 按需 URL | 批量 job 输出 JPEG | 转码 job + sprite |
| 按时间取帧 | 中间帧（不可配置） | 任意 time | 任意 time + smartcrop | 由 job 配置 | job 配置 |
| 已有视频补图 | 无（仅首帧兜底） | 是 | 是 | 是 | 是 |
| 编码兼容 | 依赖浏览器 | 服务端转码/HLS | 服务端转码/HLS | 服务端转码 | 服务端转码 |
| 预览协议 | 原文件 + Range | HLS/自适应 | HLS/自适应 | HLS/MP4 | HLS/DASH |
| 成本 | 0 转码成本 | 按分钟/存储计费 | 按分钟/存储计费 | 按转码分钟 | 按转码分钟 |
| 运维 | 极低 | 低（供应商） | 低 | 中（S3/IAM/job） | 中 |
| 数据路径 | 文件留在 R2 | 上传到 Stream | 上传到 Mux | 上传到 S3 | 上传到 GCS |
| 适合 MStor | 私有、小规模、低成本 | 最自然的 Cloudflare 升级 | 最佳缩略图/HLS 体验 | AWS 生态 | GCP 生态 |

## 4. MStor 的取舍

当前方案的核心优势：

- 零服务端视频计算成本；
- 文件不离开 R2，隐私路径简单；
- 缩略图是 WebP 小图，R2 immutable 缓存；
- 对个人/家庭云盘足够。

当前缺口：

1. 帧选择已改为中间帧；仍可能抽到黑帧/转场，行业提供任意时间点/可配置帧。
2. 已有视频没有 thumb_key，网格只能回退首帧（部分浏览器首帧为黑）。
3. 不转码：HEVC/.mov/部分编码无法播放，只能提示下载。
4. 无 HLS/多码率，长视频/移动网络体验不如 Stream/Mux。
5. 大文件/慢设备抽帧可能超时（当前 300MB/8s 上限），失败无重试/无持久任务。
6. 缩略图没有 smartcrop/旋转处理。

## 5. 分步演进建议

### Step 1（低成本，当前已具备）

- 客户端抽帧覆盖小文件/分片/秒传三条路径；
- 中间帧或可配置帧；
- 网格首帧兜底 + 播放角标；
- 预览 poster/metadata/playsInline/错误提示。

### Step 2（近期）

- 对已有视频：打开预览时抽帧并异步 POST thumb，成功后失效文件列表；或提供“批量补图”后台任务。
- 多候选帧（20% / 50% / 80%）取非纯黑/最高信息量帧；短于 1s 的视频取首帧。
- 缩略图尺寸/质量可配置，增加 640px 版本用于预览 poster。
- 记录缩略图失败原因/重试次数，提供手动“重新生成缩略图”。

### Step 3（需要预算/供应商）

- 若需要全编码兼容 + HLS + 移动网络自适应：接入 Cloudflare Stream（与现有 Cloudflare 账号最顺），R2 保留原文件或作为源。
- 若需要最佳 thumbnail/storyboard：Mux；若已在 AWS：MediaConvert + CloudFront。
- 迁移策略：视频源上传到 Stream/Mux，R2 只存原文件备份；列表返回 playbackId/thumb URL。

## 6. 决策建议

- 先做 Step 1 + Step 2，不引入转码成本；
- 当出现「大量 .mov/HEVC」「长视频移动播放」「需要时间轴预览」时再评估 Stream/Mux；
- 不自行在 Worker 内跑 ffmpeg：Workers CPU/内存与冷启动不适合视频转码，维护成本高。

## 7. 本轮代码对应

- client/src/lib/thumbnail.ts：图片/视频 Canvas 抽帧；
- client/src/hooks/useUploadQueue.ts：秒传/分片/小文件统一补缩略图；
- client/src/components/FileCard.tsx：视频缩略图/首帧/播放角标；
- client/src/components/PreviewModal.tsx：poster、preload、playsInline、加载/错误态；
- client/src/api/uploads.ts：attachThumbnail。
