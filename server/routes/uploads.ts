import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { randomId } from "../lib/crypto";
import { errors } from "../lib/errors";
import { assertQuota, adjustUsedBytes, childPath, ensureRootDir, getNode, uniqueName, validateNodeName } from "../lib/nodes";
import { abortMultipart, completeMultipart, createMultipart, presignPart } from "../lib/r2";

export const PART_SIZE = 16 * 1048576; // R2 分片最小 5MB（末片除外）

export const uploads = new Hono<AppEnv>();

uploads.post("/", async (c) => {
  const user = c.get("user");
  const { parentId = "", name, size, mime } = await c.req.json<{ parentId?: string; name: string; size: number; mime?: string }>();
  const safeName = validateNodeName(name);
  if (!Number.isFinite(size) || size <= 0) throw errors.badRequest("参数不合法");
  const limit = Number(c.env.SMALL_FILE_LIMIT);
  if (!Number.isFinite(limit)) throw new Error("SMALL_FILE_LIMIT 未配置或非法");
  if (size <= limit) throw errors.badRequest("小文件请使用直传接口");
  const parent = parentId === "" ? await ensureRootDir(c.env.DB, user.id) : await getNode(c.env.DB, user.id, parentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  await assertQuota(c.env.DB, user.id, size, Number(c.env.DEFAULT_QUOTA_BYTES));
  const id = randomId();
  const key = `${user.id}/${id}`;
  const r2UploadId = await createMultipart(c.env, key);
  await c.env.DB.prepare(
    "INSERT INTO uploads (id, owner_id, parent_id, name, size, r2_key, r2_upload_id, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'pending',?8)"
  ).bind(id, user.id, parentId, safeName, size, key, r2UploadId, Date.now()).run();
  return c.json({ uploadId: id, partSize: PART_SIZE }, 201);
});

uploads.post("/:id/part-urls", async (c) => {
  const user = c.get("user");
  const { partNumbers } = await c.req.json<{ partNumbers: number[] }>();
  if (!Array.isArray(partNumbers) || !partNumbers.length || partNumbers.length > 1000 || partNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > 10000))
    throw errors.badRequest("partNumbers 不合法");
  const row = await c.env.DB.prepare("SELECT * FROM uploads WHERE id = ?1 AND owner_id = ?2 AND status = 'pending'")
    .bind(c.req.param("id"), user.id).first<{ r2_key: string; r2_upload_id: string }>();
  if (!row) throw errors.notFound();
  const urls = await Promise.all(partNumbers.map((n) => presignPart(c.env, row.r2_key, row.r2_upload_id, n)));
  return c.json({ urls });
});

uploads.post("/:id/complete", async (c) => {
  const user = c.get("user");
  const { parts, mime, sha256 } = await c.req.json<{
    parts: { partNumber: number; etag: string }[]; mime?: string; sha256?: string;
  }>();
  if (!Array.isArray(parts) || !parts.length || parts.length > 10000) throw errors.badRequest("parts 不合法");
  // S3/R2 ETag 是带双引号的 32 位 hex；白名单校验同时挡住 XML 注入
  if (parts.some((p) => !/^"[0-9a-f]{32}"$/i.test(p.etag))) throw errors.badRequest("etag 不合法");
  if (sha256 !== undefined && !/^[0-9a-f]{64}$/i.test(sha256)) throw errors.badRequest("sha256 不合法");
  const row = await c.env.DB.prepare("SELECT * FROM uploads WHERE id = ?1 AND owner_id = ?2 AND status = 'pending'")
    .bind(c.req.param("id"), user.id).first<{ id: string; parent_id: string; name: string; size: number; r2_key: string; r2_upload_id: string }>();
  if (!row) throw errors.notFound();
  parts.sort((a, b) => a.partNumber - b.partNumber); // R2 要求 PartNumber 升序，避免 InvalidPartOrder
  await completeMultipart(c.env, row.r2_key, row.r2_upload_id, parts);
  // 物化路径需要父行（uploads 表只存 parent_id）
  const parent = row.parent_id === "" ? await ensureRootDir(c.env.DB, user.id) : await getNode(c.env.DB, user.id, row.parent_id);
  if (!parent || !parent.is_dir) throw errors.notFound();
  const parentPath = childPath(parent);
  let finalName = await uniqueName(c.env.DB, user.id, row.parent_id, row.name);
  const now = Date.now();
  const buildBatch = (n: string) => [
    c.env.DB.prepare("UPDATE uploads SET status = 'done' WHERE id = ?1").bind(row.id),
    c.env.DB.prepare(
      "INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?10,NULL)"
    ).bind(row.id, user.id, row.parent_id, parentPath, n, row.r2_key, row.size, mime ?? "application/octet-stream",
      sha256 ? sha256.toLowerCase() : null, now),
  ];
  try {
    await c.env.DB.batch(buildBatch(finalName));
  } catch (e) {
    // uniqueName 与 batch 之间并发同名撞 UNIQUE：换名重试一次（R2 上传已完成，无需重传）
    if (!(e instanceof Error && e.message.includes("UNIQUE constraint failed"))) throw e;
    finalName = await uniqueName(c.env.DB, user.id, row.parent_id, row.name);
    await c.env.DB.batch(buildBatch(finalName));
  }
  await adjustUsedBytes(c.env.DB, user.id, row.size);
  return c.json({ nodeId: row.id, name: finalName }, 201);
});

uploads.delete("/:id", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM uploads WHERE id = ?1 AND owner_id = ?2 AND status = 'pending'")
    .bind(c.req.param("id"), user.id).first<{ id: string; r2_key: string; r2_upload_id: string }>();
  if (!row) throw errors.notFound();
  await abortMultipart(c.env, row.r2_key, row.r2_upload_id);
  await c.env.DB.prepare("DELETE FROM uploads WHERE id = ?1").bind(row.id).run();
  return c.json({ ok: true });
});

/** cron 清理遗弃的 pending multipart 会话：用户中途放弃（关页/断网）后无人 abort，
 * R2 会对已传分片持续计费。超过 24h 的 pending 一律 abort + 删行（PK 扫描，行数=遗弃数）。 */
export async function abortStaleUploads(env: Env): Promise<void> {
  const cutoff = Date.now() - 24 * 3600_000;
  const { results } = await env.DB.prepare(
    "SELECT id, r2_key, r2_upload_id FROM uploads WHERE status = 'pending' AND created_at < ?1"
  ).bind(cutoff).all<{ id: string; r2_key: string; r2_upload_id: string }>();
  await Promise.all(results.map(async (row) => {
    try {
      await abortMultipart(env, row.r2_key, row.r2_upload_id);
      await env.DB.prepare("DELETE FROM uploads WHERE id = ?1").bind(row.id).run();
    } catch (e) {
      console.warn("abortStaleUploads: 清理 pending 会话失败", row.id, e);
    }
  }));
}
