/**
 * 客户端缩略图：Canvas 生成 256px WebP（零服务端转换成本）。
 * 图片与视频都走这里；任何一步失败都返回 null——缩略图是增强项，绝不能影响上传主流程。
 */
const MAX_IMAGE_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SOURCE_BYTES = 300 * 1024 * 1024;
const MAX_THUMB_BYTES = 512 * 1024;
const TARGET_WIDTH = 256;
const VIDEO_TIMEOUT_MS = 8000;

function drawThumb(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const scale = Math.min(1, TARGET_WIDTH / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob && blob.size <= MAX_THUMB_BYTES ? blob : null),
      "image/webp",
      0.7,
    );
  });
}

function waitForVideo(video: HTMLVideoElement, event: "loadedmetadata" | "loadeddata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("video timeout"));
    }, VIDEO_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, onOk);
      video.removeEventListener("error", onError);
    };
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("video decode error"));
    };
    video.addEventListener(event, onOk, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function makeImageThumbnail(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_SOURCE_BYTES) return null;
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height) return null;
    const blob = await drawThumb(bitmap, bitmap.width, bitmap.height);
    if (typeof bitmap.close === "function") bitmap.close();
    return blob;
  } catch {
    return null;
  }
}

async function makeVideoThumbnail(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("video/") || file.size > MAX_VIDEO_SOURCE_BYTES) return null;
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.style.position = "fixed";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  try {
    const metadata = waitForVideo(video, "loadedmetadata");
    video.src = url;
    document.body.appendChild(video);
    await metadata;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    // 中间帧是行业默认（Mux 默认 middle / Cloudflare 可用 thumbnailTimestampPct）；
    // 10% 容易抽到片头/黑帧，30 分钟视频的中段更能代表内容。短视频退到 0.1s。
    const target = duration > 0.2 ? Math.min(duration * 0.5, duration - 0.1) : 0;
    if (target > 0) {
      const seeked = waitForVideo(video, "seeked");
      video.currentTime = target;
      await seeked;
    } else if (video.readyState < 2) {
      await waitForVideo(video, "loadeddata");
    }
    if (!video.videoWidth || !video.videoHeight) return null;
    return await drawThumb(video, video.videoWidth, video.videoHeight);
  } catch {
    return null;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}

export async function makeThumbnail(file: File): Promise<Blob | null> {
  if (file.type.startsWith("image/")) return makeImageThumbnail(file);
  if (file.type.startsWith("video/")) return makeVideoThumbnail(file);
  return null;
}
