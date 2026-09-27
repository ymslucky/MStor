import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError, errors } from "../lib/errors";
import { pbkdf2Hash, pbkdf2Verify, randomToken } from "../lib/crypto";
import { getNode, isDescendant, listChildren } from "../lib/nodes";
import { parseIds } from "./trash";
import { serveObject } from "../lib/serve";
import type { NodeRow, ShareRow } from "../types";

export const shares = new Hono<AppEnv>();

shares.post("/", async (c) => {
  const user = c.get("user");
  const { nodeId, expiresInDays, password } = await c.req.json<{
    nodeId: string; expiresInDays?: number; password?: string;
  }>();
  // getNode 不过滤 deleted_at；分享目标必须是未删除节点
  const node = await getNode(c.env.DB, user.id, nodeId);
  if (!node || node.deleted_at) throw errors.notFound();
  if (expiresInDays !== undefined && (!Number.isFinite(expiresInDays) || expiresInDays <= 0)) {
    throw errors.badRequest("有效期须为正数天数");
  }
  const token = randomToken(16);
  const passwordHash = password ? await pbkdf2Hash(password) : null;
  const expiresAt = expiresInDays ? Date.now() + expiresInDays * 86400000 : null;
  await c.env.DB.prepare(
    "INSERT INTO shares (id, node_id, token, password_hash, expires_at, downloads, created_at, revoked_at) VALUES (?1,?2,?3,?4,?5,0,?6,NULL)"
  ).bind(randomToken(12), nodeId, token, passwordHash, expiresAt, Date.now()).run();
  return c.json({ token, url: `${c.env.PUBLIC_URL}/s/${token}` }, 201);
});

shares.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.*, n.name AS node_name, n.is_dir AS node_is_dir, n.size AS node_size
     FROM shares s JOIN nodes n ON n.id = s.node_id
     WHERE n.owner_id = ?1 AND s.revoked_at IS NULL ORDER BY s.created_at DESC`
  ).bind(c.get("user").id).all();
  return c.json({ shares: results });
});

shares.delete("/:id", async (c) => {
  const res = await c.env.DB.prepare(
    `UPDATE shares SET revoked_at = ?1
     WHERE id = ?2 AND node_id IN (SELECT id FROM nodes WHERE owner_id = ?3)`
  ).bind(Date.now(), c.req.param("id"), c.get("user").id).run();
  if (!res.meta.changes) throw errors.notFound();
  return c.json({ ok: true });
});

// 批量撤销：owner 作用域逐条 UPDATE，单项失败（他人/不存在）记入 failed 不阻断
shares.post("/batch-revoke", async (c) => {
  const ids = parseIds(await c.req.json());
  const userId = c.get("user").id;
  let revoked = 0;
  const failed: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const res = await c.env.DB.prepare(
      `UPDATE shares SET revoked_at = ?1
       WHERE id = ?2 AND node_id IN (SELECT id FROM nodes WHERE owner_id = ?3)`
    ).bind(Date.now(), id, userId).run();
    if (res.meta.changes) revoked++;
    else failed.push({ id, reason: "分享不存在" });
  }
  return c.json({ ok: true, revoked, failed });
});

export const publicShares = new Hono<AppEnv>();

async function loadShare(c: Context<AppEnv>, token: string): Promise<{ share: ShareRow; node: NodeRow }> {
  const share = await c.env.DB.prepare("SELECT * FROM shares WHERE token = ?1").bind(token).first<ShareRow>();
  if (!share || share.revoked_at) throw errors.notFound();
  if (share.expires_at && Date.now() > share.expires_at) throw new HttpError(410, "SHARE_EXPIRED", "分享已过期");
  const node = await c.env.DB.prepare("SELECT * FROM nodes WHERE id = ?1 AND deleted_at IS NULL")
    .bind(share.node_id).first<NodeRow>();
  if (!node) throw errors.notFound();
  if (share.password_hash) {
    const pw = c.req.header("x-share-password");
    if (!pw || !(await pbkdf2Verify(pw, share.password_hash))) {
      throw new HttpError(401, "SHARE_PASSWORD", "需要提取码");
    }
  }
  return { share, node };
}

publicShares.get("/:token", async (c) => {
  const { share, node } = await loadShare(c, c.req.param("token"));
  const base = {
    id: node.id,
    name: node.name,
    isDir: !!node.is_dir,
    size: node.size,
    mime: node.mime,
    hasPassword: !!share.password_hash,
    expiresAt: share.expires_at,
  };
  if (!node.is_dir) return c.json(base);
  const children = await listChildren(c.env.DB, node.owner_id, node.id);
  return c.json({
    ...base,
    children: children.map((x) => ({ id: x.id, name: x.name, isDir: !!x.is_dir, size: x.size, mime: x.mime })),
  });
});

publicShares.get("/:token/raw/:fileId", async (c) => {
  const { share, node } = await loadShare(c, c.req.param("token"));
  const fileId = c.req.param("fileId");
  const target = await getNode(c.env.DB, node.owner_id, fileId);
  // 回收站内的后代文件不可通过公开链接下载（getNode 不过滤 deleted_at，需显式排除）
  if (!target || target.is_dir || target.deleted_at || !(await isDescendant(c.env.DB, node.owner_id, node.id, fileId))) {
    throw errors.notFound();
  }
  // 计数在确认对象可下载之后：R2 缺对象 404 时不虚增
  const res = await serveObject(c, target);
  await c.env.DB.prepare("UPDATE shares SET downloads = downloads + 1 WHERE id = ?1").bind(share.id).run();
  return res;
});

// 文件夹分享的子树浏览：dirId 必须在分享根子树内（含根本身）且未删除
publicShares.get("/:token/children/:dirId", async (c) => {
  const { node } = await loadShare(c, c.req.param("token"));
  if (!node.is_dir) throw errors.notFound();
  const dirId = c.req.param("dirId");
  if (!(await isDescendant(c.env.DB, node.owner_id, node.id, dirId))) throw errors.notFound();
  const dir = await getNode(c.env.DB, node.owner_id, dirId);
  if (!dir || !dir.is_dir || dir.deleted_at) throw errors.notFound();
  const children = await listChildren(c.env.DB, node.owner_id, dirId);
  return c.json({
    name: dir.name,
    children: children.map((x) => ({ id: x.id, name: x.name, isDir: !!x.is_dir, size: x.size, mime: x.mime })),
  });
});
