import { Hono } from "hono";
import type { AppEnv } from "../env";
import { randomId } from "../lib/crypto";
import { errors, HttpError } from "../lib/errors";
import { assertQuota, adjustUsedBytes, breadcrumb, childPath, ensureRootDir, getNode, listChildren, moveNode, uniqueName, validateNodeName } from "../lib/nodes";
import { serveObject } from "../lib/serve";
import { moveMany, permanentDeleteMany, softDeleteMany, softDeleteNode, parseIds } from "./trash";

export const files = new Hono<AppEnv>();

files.get("/", async (c) => {
  const user = c.get("user");
  const parentId = c.req.query("parentId") ?? "";
  // ensureRootDir / 列目录 / breadcrumb / 父目录校验相互独立，并行降低 D1 串行往返（p99 优化）
  const [root, nodes, crumbs, parent] = await Promise.all([
    ensureRootDir(c.env.DB, user.id),
    listChildren(c.env.DB, user.id, parentId),
    parentId === "" ? Promise.resolve([]) : breadcrumb(c.env.DB, user.id, parentId),
    parentId === "" ? Promise.resolve(null) : getNode(c.env.DB, user.id, parentId),
  ]);
  if (parentId !== "" && (!parent || !parent.is_dir)) throw errors.notFound();
  // 根目录哨兵行由 listChildren 的 name != '' 过滤
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
  const parentPath = childPath(parent);
  if (normalizedSha) {
    // 与 /instant 同款 owner 隔离：跨用户按 hash 领取 = 知道 hash 即可获得内容
    const hit = await c.env.DB.prepare(
      "SELECT r2_key FROM nodes WHERE owner_id = ?1 AND sha256 = ?2 AND size = ?3 AND deleted_at IS NULL AND is_dir = 0 LIMIT 1"
    ).bind(user.id, normalizedSha, len).first<{ r2_key: string }>();
    if (hit) {
      const id = randomId();
      const insertDup = c.env.DB.prepare(
        "INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?10,NULL)"
      );
      try {
        await insertDup.bind(id, user.id, parentId, parentPath, finalName, hit.r2_key, len, mime, normalizedSha, now).run();
      } catch (e) {
        if (!(e instanceof Error && e.message.includes("UNIQUE constraint failed"))) throw e;
        finalName = await uniqueName(c.env.DB, user.id, parentId, name);
        await insertDup.bind(id, user.id, parentId, parentPath, finalName, hit.r2_key, len, mime, normalizedSha, now).run();
      }
      await adjustUsedBytes(c.env.DB, user.id, len);
      return c.json({ id, name: finalName, size: len, deduplicated: true }, 201);
    }
  }
  const id = randomId();
  const key = `${user.id}/${id}`;
  const body = c.req.raw.body;
  if (!body) throw errors.badRequest("缺少请求体");
  const obj = await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: mime } });
  const insert = c.env.DB.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?10,NULL)"
  );
  try {
    await insert.bind(id, user.id, parentId, parentPath, finalName, key, obj.size, mime, normalizedSha, now).run();
  } catch (e) {
    // uniqueName 与 INSERT 之间并发同名撞 UNIQUE：换名重试一次（R2 key 随机，无需重传）
    if (!(e instanceof Error && e.message.includes("UNIQUE constraint failed"))) throw e;
    finalName = await uniqueName(c.env.DB, user.id, parentId, name);
    await insert.bind(id, user.id, parentId, parentPath, finalName, key, obj.size, mime, normalizedSha, now).run();
  }
  await adjustUsedBytes(c.env.DB, user.id, obj.size);
  return c.json({ id, name: finalName, size: obj.size }, 201);
});

files.delete("/:id", async (c) => {
  await softDeleteNode(c.env.DB, c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});

// 秒传（先查后传）：客户端算好 SHA-256 先调本端点，命中同 hash 同 size 的现有节点
// 直接建 node 复用 R2 对象——不传文件体，实现瞬时完成；未命中（404 NO_DEDUP）走正常上传
files.post("/instant", async (c) => {
  const user = c.get("user");
  const { name, parentId = "", size, sha256, mime } = await c.req.json<{
    name: string; parentId?: string; size: number; sha256: string; mime?: string;
  }>();
  const safeName = validateNodeName(name);
  if (!Number.isFinite(size) || size <= 0 || typeof sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(sha256))
    throw errors.badRequest("参数不合法");
  // 秒传无文件体，mime 由客户端提供（浏览器 File.type）；非法值兜底 octet-stream
  const safeMime = typeof mime === "string" && /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i.test(mime)
    ? mime
    : "application/octet-stream";
  const parent = parentId === "" ? await ensureRootDir(c.env.DB, user.id) : await getNode(c.env.DB, user.id, parentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  // 秒传仅限同一用户内去重：跨用户按 hash 领取他人对象 = 知道 hash 即可获得内容（hash 非持有性证明），业界无此先例
  const hit = await c.env.DB.prepare(
    "SELECT r2_key FROM nodes WHERE owner_id = ?1 AND sha256 = ?2 AND size = ?3 AND deleted_at IS NULL AND is_dir = 0 LIMIT 1"
  ).bind(user.id, sha256.toLowerCase(), size).first<{ r2_key: string }>();
  if (!hit) throw new HttpError(404, "NO_DEDUP", "无相同内容文件");
  await assertQuota(c.env.DB, user.id, size, Number(c.env.DEFAULT_QUOTA_BYTES));
  const id = randomId();
  const now = Date.now();
  let finalName = await uniqueName(c.env.DB, user.id, parentId, safeName);
  const insert = c.env.DB.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?10,NULL)"
  );
  try {
    await insert.bind(id, user.id, parentId, childPath(parent), finalName, hit.r2_key, size, safeMime, sha256.toLowerCase(), now).run();
  } catch (e) {
    if (!(e instanceof Error && e.message.includes("UNIQUE constraint failed"))) throw e;
    finalName = await uniqueName(c.env.DB, user.id, parentId, safeName);
    await insert.bind(id, user.id, parentId, childPath(parent), finalName, hit.r2_key, size, safeMime, sha256.toLowerCase(), now).run();
  }
  await adjustUsedBytes(c.env.DB, user.id, size);
  return c.json({ id, name: finalName, size, deduplicated: true }, 201);
});

// 批量删除：集合式（一次递归闭包 + 批量语句），permanent 时软删后集合式 purge + R2 并行清理
files.post("/batch-delete", async (c) => {
  const user = c.get("user");
  const { ids, permanent = false } = await c.req.json<{ ids: string[]; permanent?: boolean }>();
  const list = parseIds({ ids });
  const deleted = permanent
    ? (await softDeleteMany(c.env.DB, user.id, list), await permanentDeleteMany(c.env, user.id, list))
    : await softDeleteMany(c.env.DB, user.id, list);
  return c.json({ ok: true, deleted, failed: [] });
});

// 批量移动：集合式（目标校验 + 同名冲突一次查 + 单条 UPDATE）
files.post("/batch-move", async (c) => {
  const user = c.get("user");
  const { ids, parentId } = await c.req.json<{ ids: string[]; parentId: string }>();
  const list = parseIds({ ids });
  const moved = await moveMany(c.env.DB, user.id, list, parentId);
  return c.json({ ok: true, moved, failed: [] });
});
