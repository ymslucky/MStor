import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv, Env } from "../env";
import { errors } from "../lib/errors";
import {
  assertQuota, adjustUsedBytes, childByName, childPath, createDir, ensureRootDir, isDescendant, listChildren, moveNode, validateNodeName,
} from "../lib/nodes";
import { randomId } from "../lib/crypto";
import { serveObject } from "../lib/serve";
import { multistatus, propResponse } from "../lib/davxml";
import { davAuth } from "../middleware/davauth";
import { permanentDeleteNode, softDeleteNode } from "./trash";
import type { NodeRow } from "../types";

export const dav = new Hono<AppEnv>();

dav.use("*", davAuth);

interface Resolved {
  node: NodeRow | null;   // 最深命中节点（可能为 null = 不存在）
  parent: NodeRow;        // 已存在的最深父目录
  parentId: string;       // DB 里的 parent_id：根约定为 ''（根哨兵行仅是标记行，其 id 不是顶级节点的父）
  segments: string[];
  walked: number;         // 实际命中层数：walked === segments.length 表示目标存在
  path: string;           // 已命中部分："." 表示根
}

// WebDAV 视角只可见未删除节点：childByName 有意不过滤 deleted_at（保持 UNIQUE 占名语义），这里包一层
async function liveChild(db: D1Database, ownerId: string, parentId: string, name: string): Promise<NodeRow | null> {
  const n = await childByName(db, ownerId, parentId, name);
  return n?.deleted_at === null ? n : null;
}

async function resolvePath(c: Context<AppEnv>): Promise<Resolved> {
  const user = c.get("user");
  let rel: string;
  try {
    rel = decodeURIComponent(new URL(c.req.url).pathname.slice("/dav".length));
  } catch {
    // 畸形百分号序列（如 %zz）：按 400 处理而非 URIError 500
    throw errors.badRequest("路径编码不合法");
  }
  const segments = rel.split("/").filter(Boolean);
  const root = await ensureRootDir(c.env.DB, user.id);
  let parent = root;
  let parentId = "";
  let node: NodeRow | null = root;
  let walked = 0;
  for (const seg of segments) {
    if (!node || !node.is_dir) break;
    parent = node;
    node = await liveChild(c.env.DB, user.id, parentId, seg);
    if (node) {
      walked++;
      parentId = node.id;
    }
  }
  const path = walked === 0 ? "." : "/" + segments.slice(0, walked).join("/");
  return { node, parent, parentId, segments, walked, path };
}

const xmlHeaders = { "content-type": 'application/xml; charset="utf-8"' };

async function propfind(c: Context<AppEnv>): Promise<Response> {
  const r = await resolvePath(c);
  // walked !== segments.length：路径未完全解析（中间某段是文件或不存在）
  if (!r.node || r.walked !== r.segments.length) return new Response(null, { status: 404 });
  const depth = (c.req.header("depth") ?? "1").trim();
  const selfHref = r.path === "." ? "/dav/" : `/dav${r.path}`;
  const responses = [propResponse(selfHref, r.node)];
  if (depth === "1" && r.node.is_dir) {
    const base = r.path === "." ? "" : r.path;
    // 根目录的子节点 parent_id 约定为 ''，子目录才是自身 id
    const listParentId = r.path === "." ? "" : r.node.id;
    for (const child of await listChildren(c.env.DB, c.get("user").id, listParentId)) {
      responses.push(propResponse(`/dav${base}/${child.name}`, child));
    }
  }
  return new Response(multistatus(responses), { status: 207, headers: xmlHeaders });
}

async function davGet(c: Context<AppEnv>): Promise<Response> {
  const r = await resolvePath(c);
  if (!r.node || r.node.is_dir || r.walked !== r.segments.length) return new Response(null, { status: 404 });
  return serveObject(c, r.node);
}

async function davPut(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const r = await resolvePath(c);
  if (!r.segments.length || !r.parent.is_dir) return new Response(null, { status: 409 });
  // 与 API 同款校验（空/超长/`.`/`..`/非法字符），防止 DAV 侧创建 UI 拒绝的节点名
  const name = validateNodeName(r.segments[r.segments.length - 1]);
  const mime = c.req.header("content-type") ?? "application/octet-stream";
  // 对齐 files.ts：按 Content-Length 做配额预检（WebDAV 无小文件直传上限，大文件即 PUT 本意）
  const len = Number(c.req.header("content-length") ?? "0");
  const checkQuota = async (extra: number) => {
    if (Number.isFinite(len) && extra > 0) await assertQuota(c.env.DB, user.id, extra, Number(c.env.DEFAULT_QUOTA_BYTES));
  };
  if (r.node) {
    // 覆盖已有文件：目标必须被完整解析且是文件（目录 / 文件位于路径中间均为 409）
    if (r.node.is_dir || r.walked !== r.segments.length) return new Response(null, { status: 409 });
    await checkQuota(len - (r.node.size ?? 0));
    const obj = await c.env.BUCKET.put(r.node.r2_key!, c.req.raw.body, { httpMetadata: { contentType: mime } });
    await c.env.DB.prepare("UPDATE nodes SET size = ?1, mime = ?2, updated_at = ?3 WHERE id = ?4")
      .bind(obj.size, mime, Date.now(), r.node.id).run();
    await adjustUsedBytes(c.env.DB, user.id, obj.size - (r.node.size ?? 0));
    // chunked PUT（无 Content-Length）预检失效的事后结算：旧对象已被覆盖无法回滚，
    // 超额时接受已发生的写入（保持 DB 与 R2 一致）再报错
    const delta = obj.size - (r.node.size ?? 0);
    if (delta > 0) await assertQuota(c.env.DB, user.id, delta, Number(c.env.DEFAULT_QUOTA_BYTES));
    return new Response(null, { status: 204 });
  }
  if (r.walked !== r.segments.length - 1) return new Response(null, { status: 409 }); // 父目录路径不存在
  await checkQuota(len);
  const id = crypto.randomUUID();
  const key = `${user.id}/${id}`;
  const obj = await c.env.BUCKET.put(key, c.req.raw.body, { httpMetadata: { contentType: mime } });
  // 事后结算（chunked PUT 兜底）：新对象尚无 DB 引用，超额时删除孤儿对象干净回滚
  try {
    await assertQuota(c.env.DB, user.id, obj.size, Number(c.env.DEFAULT_QUOTA_BYTES));
  } catch (e) {
    await c.env.BUCKET.delete(key);
    throw e;
  }
  const now = Date.now();
  const insert = c.env.DB.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?9,NULL)"
  ).bind(id, user.id, r.parentId, childPath(r.parent), name, key, obj.size, mime, now);
  try {
    await insert.run();
  } catch (e) {
    // 同名软删除节点仍占 UNIQUE(owner_id,parent_id,name)：DAV PUT 不能改名，映射为 409
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) throw errors.conflict("目标名称被回收站占用");
    throw e;
  }
  await adjustUsedBytes(c.env.DB, user.id, obj.size);
  return new Response(null, { status: 201 });
}

// DAV DELETE / 覆盖写语义是彻底删除：活跃节点先软删（复用护根与子树原子标记）再永久清除；
// 回收站占名节点已是删除态，直接永久清除
async function purgeNode(env: Env, ownerId: string, id: string, deletedAt: number | null): Promise<void> {
  if (deletedAt === null) await softDeleteNode(env.DB, ownerId, id);
  await permanentDeleteNode(env, ownerId, id);
}

// Destination 头解析：仅接受同源绝对 URL 或以 /dav 开头的路径，返回非空段
function destinationSegments(c: Context<AppEnv>): string[] | null {
  const dest = c.req.header("destination");
  if (!dest) return null;
  try {
    const u = new URL(dest, c.req.url);
    if (u.origin !== new URL(c.req.url).origin) return null;
    // 严格前缀：/davX 不算 DAV 路径
    if (u.pathname !== "/dav" && !u.pathname.startsWith("/dav/")) return null;
    const segs = decodeURIComponent(u.pathname.slice("/dav".length)).split("/").filter(Boolean);
    return segs.length ? segs : null;
  } catch {
    return null;
  }
}

// 逐段解析目标父路径：与 resolvePath 同语义（liveChild 过滤回收站、每段必须是目录），
// 返回该父目录的节点行（物化路径需要父行）——Destination 在根时为根哨兵行（其 id 不是顶级节点的父）
async function walkToDir(c: Context<AppEnv>, segments: string[]): Promise<NodeRow | null> {
  const user = c.get("user");
  let parent = await ensureRootDir(c.env.DB, user.id);
  let parentId = "";
  for (const seg of segments) {
    const next = await liveChild(c.env.DB, user.id, parentId, seg);
    if (!next || !next.is_dir) return null;
    parent = next;
    parentId = next.id;
  }
  return parent;
}

/** DB parent_id 约定：根哨兵行（name=''）的子节点 parent_id 为 ''，其余为父行 id */
function parentIdOf(row: NodeRow): string {
  return row.name === "" ? "" : row.id;
}

async function davMkcol(c: Context<AppEnv>): Promise<Response> {
  const r = await resolvePath(c);
  // 目标已完整存在（目录/文件/根）→ 405；父路径中间是文件 → 409
  if (r.node && r.walked === r.segments.length) return new Response(null, { status: 405 });
  if (r.node && !r.node.is_dir) return new Response(null, { status: 409 });
  if (r.segments.length === 0 || r.walked !== r.segments.length - 1 || !r.parent.is_dir)
    return new Response(null, { status: 409 });
  validateNodeName(r.segments[r.segments.length - 1]);
  // 顶级目录挂根：parentId 是 ''（根哨兵行仅是标记行），与 PUT 新建分支同款
  await createDir(c.env.DB, c.get("user").id, r.parentId, r.segments[r.segments.length - 1]);
  return new Response(null, { status: 201 });
}

async function davDelete(c: Context<AppEnv>): Promise<Response> {
  const r = await resolvePath(c);
  if (!r.node || r.path === "." || r.walked !== r.segments.length) return new Response(null, { status: 404 });
  await purgeNode(c.env, c.get("user").id, r.node.id, r.node.deleted_at);
  return new Response(null, { status: 204 });
}

async function davMove(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const r = await resolvePath(c);
  if (!r.node || r.path === "." || r.walked !== r.segments.length) return new Response(null, { status: 404 });
  const destSegs = destinationSegments(c);
  if (!destSegs) return new Response(null, { status: 400 });
  const destName = validateNodeName(destSegs[destSegs.length - 1]);
  const destParent = await walkToDir(c, destSegs.slice(0, -1));
  if (destParent === null) return new Response(null, { status: 409 });
  const destParentId = parentIdOf(destParent);
  const existing = await childByName(c.env.DB, user.id, destParentId, destName);
  if (existing && existing.id === r.node.id) return new Response(null, { status: 403 }); // 原地 MOVE 会先毁源
  if (existing && c.req.header("overwrite")?.toLowerCase() === "f") return new Response(null, { status: 412 });
  // 目录不能移入自身子树：purge 先于 moveNode 执行，必须先拒绝，否则目标子树会被永久删除后才报错
  if (r.node.is_dir && await isDescendant(c.env.DB, user.id, r.node.id, destParentId))
    return new Response(null, { status: 409 });
  if (existing) await purgeNode(c.env, user.id, existing.id, existing.deleted_at);
  // 目录移入自身子树已在上面的预检拒绝；其余冲突由 moveNode 内的 isDescendant 兜底
  await moveNode(c.env.DB, user.id, r.node.id, destParentId, destName);
  return new Response(null, { status: existing ? 204 : 201 });
}

async function copyInto(c: Context<AppEnv>, src: NodeRow, destParent: NodeRow, name: string): Promise<void> {
  const user = c.get("user");
  const destParentId = parentIdOf(destParent);
  if (src.is_dir) {
    // 传入父行 parentHint：createDir 免去重复查询
    const dir = await createDir(c.env.DB, user.id, destParentId, name, destParent);
    for (const child of await listChildren(c.env.DB, user.id, src.id)) {
      await copyInto(c, child, dir, child.name);
    }
  } else {
    // 复制生成新 id / 新 r2_key，对象独立不与源共享：
    // 本 workers-types / miniflare 版本的 R2Bucket 无 copy()，用 get + put 流式复制
    const id = randomId();
    const key = `${user.id}/${id}`;
    const obj = await c.env.BUCKET.get(src.r2_key!);
    if (!obj) throw errors.notFound();
    await c.env.BUCKET.put(key, obj.body, { httpMetadata: obj.httpMetadata });
    const now = Date.now();
    try {
      await c.env.DB.prepare(
        "INSERT INTO nodes (id, owner_id, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?9,NULL)"
      ).bind(id, user.id, destParentId, childPath(destParent), name, key, src.size, src.mime, now).run();
    } catch (e) {
      // 对齐 davPut 新建分支：DB 插入失败清掉已复制的 R2 对象，不留孤儿
      await c.env.BUCKET.delete(key);
      throw e;
    }
    await adjustUsedBytes(c.env.DB, user.id, src.size ?? 0);
  }
}

async function davCopy(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const r = await resolvePath(c);
  if (!r.node || r.path === "." || r.walked !== r.segments.length) return new Response(null, { status: 404 });
  const destSegs = destinationSegments(c);
  if (!destSegs) return new Response(null, { status: 400 });
  const destName = validateNodeName(destSegs[destSegs.length - 1]);
  const destParent = await walkToDir(c, destSegs.slice(0, -1));
  if (destParent === null) return new Response(null, { status: 409 });
  const destParentId = parentIdOf(destParent);
  // 目录不能复制进自身子树：copyInto 会无限递归
  if (r.node.is_dir && await isDescendant(c.env.DB, user.id, r.node.id, destParentId))
    return new Response(null, { status: 409 });
  const existing = await childByName(c.env.DB, user.id, destParentId, destName);
  if (existing && existing.id === r.node.id) return new Response(null, { status: 403 });
  if (existing && c.req.header("overwrite")?.toLowerCase() === "f") return new Response(null, { status: 412 });
  if (existing) await purgeNode(c.env, user.id, existing.id, existing.deleted_at);
  await copyInto(c, r.node, destParent, destName);
  return new Response(null, { status: existing ? 204 : 201 });
}

// 假锁：无锁表、不校验 If 头，仅返回带 token 的 lockdiscovery 应答（DAV:2 客户端握手用）
function davLock(): Response {
  const token = `opaquelocktoken:mstor-${randomId()}`;
  const body =
    `<?xml version="1.0" encoding="utf-8"?><D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock>` +
    `<D:locktoken><D:href>${token}</D:href></D:locktoken></D:activelock></D:lockdiscovery></D:prop>`;
  return new Response(body, { status: 200, headers: { ...xmlHeaders, "lock-token": `<${token}>` } });
}

dav.on(["OPTIONS", "GET", "HEAD", "PUT", "PROPFIND", "MKCOL", "DELETE", "MOVE", "COPY", "LOCK", "UNLOCK"], "*", async (c) => {
  switch (c.req.method) {
    case "OPTIONS":
      return new Response(null, {
        status: 200,
        headers: {
          DAV: "1, 2",
          "MS-Author-Via": "DAV",
          Allow: "OPTIONS, GET, HEAD, PUT, PROPFIND, MKCOL, DELETE, MOVE, COPY, LOCK, UNLOCK",
        },
      });
    case "PROPFIND": return propfind(c);
    case "GET":
    case "HEAD": return davGet(c);
    case "PUT": return davPut(c);
    case "MKCOL": return davMkcol(c);
    case "DELETE": return davDelete(c);
    case "MOVE": return davMove(c);
    case "COPY": return davCopy(c);
    case "LOCK": return davLock();
    case "UNLOCK": return new Response(null, { status: 204 });
    default: return new Response(null, { status: 405 });
  }
});
