/**
 * 客户端缩略图：Canvas 生成 256px WebP（零服务端转换成本，方案 §2.7 选型）。
 * 任何一步失败都返回 null——缩略图是增强项，绝不能影响上传主流程。
 */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_THUMB_BYTES = 512 * 1024;
const TARGET_WIDTH = 256;

export async function makeThumbnail(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("image/") || file.size > MAX_SOURCE_BYTES) return null;
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    if (!width || !height) return null;
    const scale = Math.min(1, TARGET_WIDTH / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === "function") bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.7));
    if (!blob || blob.size > MAX_THUMB_BYTES) return null;
    return blob;
  } catch {
    return null;
  }
}
