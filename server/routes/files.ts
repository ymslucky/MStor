import { Hono } from "hono";
import type { AppEnv } from "../env";
import { randomId } from "../lib/crypto";
import { errors, HttpError } from "../lib/errors";
import { assertQuota, adjustUsedBytes, breadcrumb, childPath, getNode, listChildren, moveNode, resolveParent, uniqueName, validateNodeName } from "../lib/nodes";
import { serveObject } from "../lib/serve";
import { isUniqueViolation } from "../lib/sql";
import { assertGlobalBudget, notifyIfStorageLevelHigh, recomputeStorageStats, storageDeltaStmt } from "../data/storage";
import { copyNode } from "../data/copy";
import { recordMoveUndo, undoOperation } from "../data/operations";
import { moveMany, permanentDeleteMany, softDeleteMany, softDeleteNode, parseIds } from "../data/trash";

export const files = new Hono<AppEnv>();

files.get("/", async (c) => {
  const parentId = c.req.query("parentId") ?? "";
  // 根哨兵行先行解析（顶层 parent_id 为哨兵行 id，不能再用 '' 查列表），其余查询并行
  const root = await resolveParent(c.env.DB, c.get("workspace").id, parentId);
  if (!root || !root.is_dir) throw errors.notFound();
  const [nodes, crumbs] = await Promise.all([
    listChildren(c.env.DB, c.get("workspace").id, root.id),
    parentId === "" ? Promise.resolve([]) : breadcrumb(c.env.DB, c.get("workspace").id, parentId),
  ]);
  return c.json({ nodes, breadcrumb: crumbs, rootId: root.id });
});

files.patch("/:id", async (c) => {
  const { name, parentId } = await c.req.json<{ name?: string; parentId?: string }>();
  const node = await getNode(c.env.DB, c.get("workspace").id, c.req.param("id"));
  if (!node) throw errors.notFound();
  const nextName = name !== undefined ? validateNodeName(name) : node.name;
  await moveNode(c.env.DB, c.get("workspace").id, node.id, parentId ?? node.parent_id, nextName);
  // 记录 30 秒撤销窗口（前端 Snackbar 用 undoId 回滚）
  const undoId = await recordMoveUndo(c.env.DB, {
    workspaceId: c.get("workspace").id,
    actorId: c.get("user").id,
    nodeId: node.id,
    oldParentId: node.parent_id,
    oldName: node.name,
  });
  return c.json({ ok: true, undoId });
});

// 复制（含目录整棵子树；R2 对象共享、配额按逻辑字节计）
files.post("/:id/copy", async (c) => {
  const { parentId } = await c.req.json<{ parentId?: string }>();
  const result = await copyNode(
    c.env.DB,
    c.get("workspace").id,
    c.get("user").id,
    c.req.param("id"),
    parentId ?? "",
  );
  return c.json(result, 201);
});

// 撤销移动/改名（30 秒窗口）
files.post("/operations/:id/undo", async (c) => {
  await undoOperation(c.env.DB, c.get("workspace").id, c.req.param("id"));
  return c.json({ ok: true });
});

files.get("/:id/content", async (c) => {
  const node = await getNode(c.env.DB, c.get("workspace").id, c.req.param("id"));
  if (!node || node.is_dir) throw errors.notFound();
  return serveObject(c, node);
});

files.put("/upload", async (c) => {
  const name = validateNodeName(c.req.query("name"));
  const parentId = c.req.query("parentId") ?? "";
  const len = Number(c.req.header("content-length") ?? "0");
  const limit = Number(c.env.SMALL_FILE_LIMIT);
  if (!Number.isFinite(limit)) throw new Error("SMALL_FILE_LIMIT 未配置或非法");
  const limitMsg = `文件大小非法或超过小文件直传上限（${Math.floor(limit / 1048576)}MB），请使用网页端上传大文件`;
  // 预检：仅当 Content-Length 存在且非法/超限时快速拒绝；缺失时不信任该值（写入后按 R2 实际大小判定）
  const lenHeader = c.req.header("content-length");
  if (lenHeader !== undefined && (!Number.isFinite(len) || len < 0 || len > limit)) throw errors.badRequest(limitMsg);
  const parent = await resolveParent(c.env.DB, c.get("workspace").id, parentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  let finalName = await uniqueName(c.env.DB, c.get("workspace").id, parent.id, name);
  const now = Date.now();
  const mime = c.req.header("content-type") ?? "application/octet-stream";
  // 秒传：客户端对 ≤60MB 文件预计算 SHA-256，命中同 hash 同 size 的现有节点直接复用 R2 对象（不重复存储）
  const sha256 = c.req.header("x-file-sha256");
  const normalizedSha = sha256 && /^[0-9a-f]{64}$/i.test(sha256) ? sha256.toLowerCase() : null;
  const parentPath = childPath(parent);
  if (normalizedSha) {
    // 与 /instant 同款 owner 隔离：跨用户按 hash 领取 = 知道 hash 即可获得内容
    const hit = await c.env.DB.prepare(
      "SELECT r2_key FROM nodes WHERE workspace_id = ?1 AND sha256 = ?2 AND size = ?3 AND deleted_at IS NULL AND is_dir = 0 LIMIT 1"
    ).bind(c.get("workspace").id, normalizedSha, len).first<{ r2_key: string }>();
    if (hit) {
      // 秒传命中：size 由既有节点保证真实（非客户端声明），据此校验配额
      await assertGlobalBudget(c.env, len);
      await assertQuota(c.env.DB, c.get("workspace").id, len, Number(c.env.DEFAULT_QUOTA_BYTES));
      const id = randomId();
      const insertDup = c.env.DB.prepare(
        "INSERT INTO nodes (id, workspace_id, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?10,NULL)"
      );
      try {
        await insertDup.bind(id, c.get("workspace").id, parent.id, parentPath, finalName, hit.r2_key, len, mime, normalizedSha, now).run();
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        finalName = await uniqueName(c.env.DB, c.get("workspace").id, parent.id, name);
        await insertDup.bind(id, c.get("workspace").id, parent.id, parentPath, finalName, hit.r2_key, len, mime, normalizedSha, now).run();
      }
      await adjustUsedBytes(c.env.DB, c.get("workspace").id, len);
      await storageDeltaStmt(c.env.DB, c.get("workspace").id, { active: len }).run();
    await notifyIfStorageLevelHigh(c.env, c.get("workspace").id);
      return c.json({ id, name: finalName, size: len, deduplicated: true }, 201);
    }
  }
  const id = randomId();
  const key = `${c.get("workspace").id}/${id}`;
  const body = c.req.raw.body;
  if (!body) throw errors.badRequest("缺少请求体");
  const obj = await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: mime } });
  // 硬校验：以 R2 实际对象大小为准（Content-Length 可被客户端伪造/省略，仅作预检）
  if (obj.size > limit) {
    // 超限回滚：删对象 + 回收随机 key（不占目录名），避免绕过上限
    await c.env.BUCKET.delete(key);
    throw errors.badRequest(limitMsg);
  }
  // 对象已写入但尚未登记 nodes：其后任何失败（配额拒绝 / 插入异常）都必须回滚对象，
  // 否则 R2 里会留下无任何行引用、也不在 orphan_objects 里的永久孤儿（配额拒绝可反复触发）
  const insert = c.env.DB.prepare(
    "INSERT INTO nodes (id, workspace_id, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?10,NULL)"
  );
  try {
    await assertGlobalBudget(c.env, obj.size);
    await assertQuota(c.env.DB, c.get("workspace").id, obj.size, Number(c.env.DEFAULT_QUOTA_BYTES));
    try {
      await insert.bind(id, c.get("workspace").id, parent.id, parentPath, finalName, key, obj.size, mime, normalizedSha, now).run();
    } catch (e) {
      // uniqueName 与 INSERT 之间并发同名撞唯一索引：换名重试一次（R2 key 随机，无需重传）
      if (!isUniqueViolation(e)) throw e;
      finalName = await uniqueName(c.env.DB, c.get("workspace").id, parent.id, name);
      await insert.bind(id, c.get("workspace").id, parent.id, parentPath, finalName, key, obj.size, mime, normalizedSha, now).run();
    }
  } catch (e) {
    await c.env.BUCKET.delete(key).catch(() => {});
    throw e;
  }
  await adjustUsedBytes(c.env.DB, c.get("workspace").id, obj.size);
  await storageDeltaStmt(c.env.DB, c.get("workspace").id, { active: obj.size }).run();
    await notifyIfStorageLevelHigh(c.env, c.get("workspace").id);
  return c.json({ id, name: finalName, size: obj.size }, 201);
});

files.delete("/:id", async (c) => {
  await softDeleteNode(c.env.DB, c.get("workspace").id, c.req.param("id"));
  await recomputeStorageStats(c.env.DB, c.get("workspace").id);
  return c.json({ ok: true });
});

// 秒传（先查后传）：客户端算好 SHA-256 先调本端点，命中同 hash 同 size 的现有节点
// 直接建 node 复用 R2 对象——不传文件体，实现瞬时完成；未命中（404 NO_DEDUP）走正常上传
files.post("/instant", async (c) => {
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
  const parent = await resolveParent(c.env.DB, c.get("workspace").id, parentId);
  if (!parent || !parent.is_dir) throw errors.notFound();
  // 秒传仅限同一用户内去重：跨用户按 hash 领取他人对象 = 知道 hash 即可获得内容（hash 非持有性证明），业界无此先例
  const hit = await c.env.DB.prepare(
    "SELECT r2_key FROM nodes WHERE workspace_id = ?1 AND sha256 = ?2 AND size = ?3 AND deleted_at IS NULL AND is_dir = 0 LIMIT 1"
  ).bind(c.get("workspace").id, sha256.toLowerCase(), size).first<{ r2_key: string }>();
  if (!hit) throw new HttpError(404, "NO_DEDUP", "无相同内容文件");
  await assertGlobalBudget(c.env, size);
  await assertQuota(c.env.DB, c.get("workspace").id, size, Number(c.env.DEFAULT_QUOTA_BYTES));
  const id = randomId();
  const now = Date.now();
  let finalName = await uniqueName(c.env.DB, c.get("workspace").id, parent.id, safeName);
  const insert = c.env.DB.prepare(
    "INSERT INTO nodes (id, workspace_id, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?10,NULL)"
  );
  try {
    await insert.bind(id, c.get("workspace").id, parent.id, childPath(parent), finalName, hit.r2_key, size, safeMime, sha256.toLowerCase(), now).run();
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    finalName = await uniqueName(c.env.DB, c.get("workspace").id, parent.id, safeName);
    await insert.bind(id, c.get("workspace").id, parent.id, childPath(parent), finalName, hit.r2_key, size, safeMime, sha256.toLowerCase(), now).run();
  }
  await adjustUsedBytes(c.env.DB, c.get("workspace").id, size);
  await storageDeltaStmt(c.env.DB, c.get("workspace").id, { active: size }).run();
    await notifyIfStorageLevelHigh(c.env, c.get("workspace").id);
  return c.json({ id, name: finalName, size, deduplicated: true }, 201);
});

// 批量删除：集合式（一次递归闭包 + 批量语句），permanent 时软删后集合式 purge + R2 并行清理
files.post("/batch-delete", async (c) => {
  const { ids, permanent = false } = await c.req.json<{ ids: string[]; permanent?: boolean }>();
  const list = parseIds({ ids });
  const deleted = permanent
    ? (await softDeleteMany(c.env.DB, c.get("workspace").id, list), await permanentDeleteMany(c.env, c.get("workspace").id, list))
    : await softDeleteMany(c.env.DB, c.get("workspace").id, list);
  await recomputeStorageStats(c.env.DB, c.get("workspace").id);
  return c.json({ ok: true, deleted, failed: [] });
});

// 批量移动：集合式（目标校验 + 同名冲突一次查 + 单条 UPDATE）
files.post("/batch-move", async (c) => {
  const { ids, parentId } = await c.req.json<{ ids: string[]; parentId: string }>();
  const list = parseIds({ ids });
  const moved = await moveMany(c.env.DB, c.get("workspace").id, list, parentId);
  return c.json({ ok: true, moved, failed: [] });
});
