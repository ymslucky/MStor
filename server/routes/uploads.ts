import { Hono } from "hono";
import type { AppEnv } from "../env";
import { randomId } from "../lib/crypto";
import { errors } from "../lib/errors";
import { assertQuota, ensureRootDir, getNode, uniqueName, validateNodeName } from "../lib/nodes";
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
  const { parts, mime } = await c.req.json<{ parts: { partNumber: number; etag: string }[]; mime?: string }>();
  if (!Array.isArray(parts) || !parts.length || parts.length > 10000) throw errors.badRequest("parts 不合法");
  // S3/R2 ETag 是带双引号的 32 位 hex；白名单校验同时挡住 XML 注入
  if (parts.some((p) => !/^"[0-9a-f]{32}"$/i.test(p.etag))) throw errors.badRequest("etag 不合法");
  const row = await c.env.DB.prepare("SELECT * FROM uploads WHERE id = ?1 AND owner_id = ?2 AND status = 'pending'")
    .bind(c.req.param("id"), user.id).first<{ id: string; parent_id: string; name: string; size: number; r2_key: string; r2_upload_id: string }>();
  if (!row) throw errors.notFound();
  parts.sort((a, b) => a.partNumber - b.partNumber); // R2 要求 PartNumber 升序，避免 InvalidPartOrder
  await completeMultipart(c.env, row.r2_key, row.r2_upload_id, parts);
  let finalName = await uniqueName(c.env.DB, user.id, row.parent_id, row.name);
  const now = Date.now();
  const buildBatch = (n: string) => [
    c.env.DB.prepare("UPDATE uploads SET status = 'done' WHERE id = ?1").bind(row.id),
    c.env.DB.prepare(
      "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,0,?5,?6,?7,?8,?8,NULL)"
    ).bind(row.id, user.id, row.parent_id, n, row.r2_key, row.size, mime ?? "application/octet-stream", now),
  ];
  try {
    await c.env.DB.batch(buildBatch(finalName));
  } catch (e) {
    // uniqueName 与 batch 之间并发同名撞 UNIQUE：换名重试一次（R2 上传已完成，无需重传）
    if (!(e instanceof Error && e.message.includes("UNIQUE constraint failed"))) throw e;
    finalName = await uniqueName(c.env.DB, user.id, row.parent_id, row.name);
    await c.env.DB.batch(buildBatch(finalName));
  }
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
