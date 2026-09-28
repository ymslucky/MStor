import { Hono } from "hono";
import type { AppEnv } from "../env";
import { randomId } from "../lib/crypto";
import { errors } from "../lib/errors";
import { assertQuota, breadcrumb, ensureRootDir, getNode, listChildren, moveNode, uniqueName, validateNodeName } from "../lib/nodes";
import { serveObject } from "../lib/serve";
import { softDeleteNode } from "./trash";

export const files = new Hono<AppEnv>();

files.get("/", async (c) => {
  const user = c.get("user");
  const parentId = c.req.query("parentId") ?? "";
  const root = await ensureRootDir(c.env.DB, user.id);
  if (parentId !== "") {
    const parent = await getNode(c.env.DB, user.id, parentId);
    if (!parent || !parent.is_dir) throw errors.notFound();
  }
  // 根目录哨兵行由 listChildren 的 name != '' 过滤
  const nodes = await listChildren(c.env.DB, user.id, parentId);
  const crumbs = parentId === "" ? [] : await breadcrumb(c.env.DB, user.id, parentId);
  return c.json({ nodes, breadcrumb: crumbs, rootId: root.id });
});

files.patch("/:id", async (c) => {
  const user = c.get("user");
  const { name, parentId } = await c.req.json<{ name?: string; parentId?: string }>();
  const node = await getNode(c.env.DB, user.id, c.req.param("id"));
  if (!node) throw errors.notFound();
  const nextName = name !== undefined ? validateNodeName(name) : node.name;
  await moveNode(c.env.DB, user.id, node.id, parentId ?? node.parent_id, nextName);
  return c.json({ ok: true });
});

files.get("/:id/content", async (c) => {
  const node = await getNode(c.env.DB, c.get("user").id, c.req.param("id"));
  if (!node || node.is_dir) throw errors.notFound();
  return serveObject(c, node);
});

files.put("/upload", async (c) => {
  const user = c.get("user");
  const name = validateNodeName(c.req.query("name"));
  const parentId = c.req.query("parentId") ?? "";
  const len = Number(c.req.header("content-length") ?? "0");
  const limit = Number(c.env.SMALL_FILE_LIMIT);
  if (!Number.isFinite(limit)) throw new Error("SMALL_FILE_LIMIT 未配置或非法");
  if (!Number.isFinite(len) || len < 0 || len > limit) throw errors.badRequest(`文件大小非法或超过小文件直传上限（${Math.floor(limit / 1048576)}MB），请使用网页端上传大文件`);
  const parent = parentId === "" ? await ensureRootDir(c.env.DB, user.id) : await getNode(c.env.DB, user.id, parentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  let finalName = await uniqueName(c.env.DB, user.id, parentId, name);
  await assertQuota(c.env.DB, user.id, len, Number(c.env.DEFAULT_QUOTA_BYTES));
  const now = Date.now();
  const mime = c.req.header("content-type") ?? "application/octet-stream";
  // 秒传：客户端对 ≤60MB 文件预计算 SHA-256，命中同 hash 同 size 的现有节点直接复用 R2 对象（不重复存储）
  const sha256 = c.req.header("x-file-sha256");
  const normalizedSha = sha256 && /^[0-9a-f]{64}$/i.test(sha256) ? sha256.toLowerCase() : null;
  if (normalizedSha) {
    const hit = await c.env.DB.prepare(
      "SELECT r2_key FROM nodes WHERE sha256 = ?1 AND size = ?2 AND deleted_at IS NULL AND is_dir = 0 LIMIT 1"
    ).bind(normalizedSha, len).first<{ r2_key: string }>();
    if (hit) {
      const id = randomId();
      const insertDup = c.env.DB.prepare(
        "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,0,?5,?6,?7,?8,?9,?9,NULL)"
      );
      try {
        await insertDup.bind(id, user.id, parentId, finalName, hit.r2_key, len, mime, normalizedSha, now).run();
      } catch (e) {
        if (!(e instanceof Error && e.message.includes("UNIQUE constraint failed"))) throw e;
        finalName = await uniqueName(c.env.DB, user.id, parentId, name);
        await insertDup.bind(id, user.id, parentId, finalName, hit.r2_key, len, mime, normalizedSha, now).run();
      }
      return c.json({ id, name: finalName, size: len, deduplicated: true }, 201);
    }
  }
  const id = randomId();
  const key = `${user.id}/${id}`;
  const body = c.req.raw.body;
  if (!body) throw errors.badRequest("缺少请求体");
  const obj = await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: mime } });
  const insert = c.env.DB.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,0,?5,?6,?7,?8,?9,?9,NULL)"
  );
  try {
    await insert.bind(id, user.id, parentId, finalName, key, obj.size, mime, normalizedSha, now).run();
  } catch (e) {
    // uniqueName 与 INSERT 之间并发同名撞 UNIQUE：换名重试一次（R2 key 随机，无需重传）
    if (!(e instanceof Error && e.message.includes("UNIQUE constraint failed"))) throw e;
    finalName = await uniqueName(c.env.DB, user.id, parentId, name);
    await insert.bind(id, user.id, parentId, finalName, key, obj.size, mime, normalizedSha, now).run();
  }
  return c.json({ id, name: finalName, size: obj.size }, 201);
});

files.delete("/:id", async (c) => {
  await softDeleteNode(c.env.DB, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
