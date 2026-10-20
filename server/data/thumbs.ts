import { errors } from "../lib/errors";
import { getNode } from "../lib/nodes";
import { storageDeltaStmt } from "./storage";

/** 缩略图上限：客户端用 Canvas 生成 WebP，256px 宽通常 < 40KB；512KB 足够宽容又防滥用 */
export const MAX_THUMB_BYTES = 512 * 1024;

export function thumbKey(workspaceId: string, nodeId: string): string {
  return `${workspaceId}/${nodeId}.thumb`;
}

/**
 * 写缩略图：同一个 key 覆盖写（节点内容不可变，缩略图自然也不变），
 * 只有「从无到有」才计入 thumb_bytes，避免重复上传把统计撑大。
 */
export async function putThumb(
  env: { DB: D1Database; BUCKET: R2Bucket },
  workspaceId: string,
  nodeId: string,
  body: ReadableStream | ArrayBuffer,
  contentType: string,
): Promise<{ key: string; bytes: number }> {
  const node = await getNode(env.DB, workspaceId, nodeId);
  if (!node || node.is_dir || node.deleted_at) throw errors.notFound();
  if (!contentType.startsWith("image/")) throw errors.badRequest("缩略图必须是图片");
  const key = thumbKey(workspaceId, nodeId);
  const obj = await env.BUCKET.put(key, body, { httpMetadata: { contentType } });
  if (obj.size > MAX_THUMB_BYTES) {
    await env.BUCKET.delete(key);
    throw errors.badRequest(`缩略图不得超过 ${Math.floor(MAX_THUMB_BYTES / 1024)}KB`);
  }
  const hadThumb = node.thumb_key !== null;
  await env.DB.batch([
    env.DB.prepare("UPDATE nodes SET thumb_key = ?1, updated_at = ?2 WHERE id = ?3 AND workspace_id = ?4")
      .bind(key, Date.now(), nodeId, workspaceId),
    ...(hadThumb ? [] : [storageDeltaStmt(env.DB, workspaceId, { thumb: obj.size })]),
  ]);
  return { key, bytes: obj.size };
}

export async function getThumb(
  env: { DB: D1Database; BUCKET: R2Bucket },
  workspaceId: string,
  nodeId: string,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  const node = await getNode(env.DB, workspaceId, nodeId);
  if (!node || !node.thumb_key || node.deleted_at) return null;
  const obj = await env.BUCKET.get(node.thumb_key);
  if (!obj) return null;
  return { body: obj.body as ReadableStream, contentType: obj.httpMetadata?.contentType ?? "image/webp" };
}
