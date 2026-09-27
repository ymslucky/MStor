import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { errors } from "../lib/errors";
import { assertQuota, childByName, ensureRootDir, listChildren } from "../lib/nodes";
import { serveObject } from "../lib/serve";
import { multistatus, propResponse } from "../lib/davxml";
import { davAuth } from "../middleware/davauth";
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
  const rel = decodeURIComponent(new URL(c.req.url).pathname.slice("/dav".length));
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
  const name = r.segments[r.segments.length - 1];
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
    return new Response(null, { status: 204 });
  }
  if (r.walked !== r.segments.length - 1) return new Response(null, { status: 409 }); // 父目录路径不存在
  await checkQuota(len);
  const id = crypto.randomUUID();
  const key = `${user.id}/${id}`;
  const obj = await c.env.BUCKET.put(key, c.req.raw.body, { httpMetadata: { contentType: mime } });
  const now = Date.now();
  const insert = c.env.DB.prepare(
    "INSERT INTO nodes (id, owner_id, parent_id, name, is_dir, r2_key, size, mime, created_at, updated_at, deleted_at) VALUES (?1,?2,?3,?4,0,?5,?6,?7,?8,?8,NULL)"
  ).bind(id, user.id, r.parentId, name, key, obj.size, mime, now);
  try {
    await insert.run();
  } catch (e) {
    // 同名软删除节点仍占 UNIQUE(owner_id,parent_id,name)：DAV PUT 不能改名，映射为 409
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) throw errors.conflict("目标名称被回收站占用");
    throw e;
  }
  return new Response(null, { status: 201 });
}

dav.on(["OPTIONS", "GET", "HEAD", "PUT", "PROPFIND"], "*", async (c) => {
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
    default: return new Response(null, { status: 405 });
  }
});
