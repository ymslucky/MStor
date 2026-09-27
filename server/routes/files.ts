import { Hono } from "hono";
import type { AppEnv } from "../env";
import { randomId } from "../lib/crypto";
import { errors } from "../lib/errors";
import { assertQuota, breadcrumb, ensureRootDir, getNode, listChildren, moveNode, uniqueName, validateNodeName } from "../lib/nodes";

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
  const id = randomId();
  const key = `${user.id}/${id}`;
  const mime = c.req.header("content-type") ?? "application/octet-stream";
  const body = c.req.raw.body;
  if (!body) throw errors.badRequest("缺少请求体");
  const obj = await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: mime } });
  const now = Date.now();
  const insert = c.env.DB.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,0,?5,?6,?7,?8,?8,NULL)"
  );
  try {
    await insert.bind(id, user.id, parentId, finalName, key, obj.size, mime, now).run();
  } catch (e) {
    // uniqueName 与 INSERT 之间并发同名撞 UNIQUE：换名重试一次（R2 key 随机，无需重传）
    if (!(e instanceof Error && e.message.includes("UNIQUE constraint failed"))) throw e;
    finalName = await uniqueName(c.env.DB, user.id, parentId, name);
    await insert.bind(id, user.id, parentId, finalName, key, obj.size, mime, now).run();
  }
  return c.json({ id, name: finalName, size: obj.size }, 201);
});
