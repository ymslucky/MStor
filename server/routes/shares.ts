import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError, errors } from "../lib/errors";
import { pbkdf2Hash, pbkdf2Verify, randomToken } from "../lib/crypto";
import { getNode, isDescendant, listChildren } from "../lib/nodes";
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
  if (!target || target.is_dir || !(await isDescendant(c.env.DB, node.owner_id, node.id, fileId))) {
    throw errors.notFound();
  }
  await c.env.DB.prepare("UPDATE shares SET downloads = downloads + 1 WHERE id = ?1").bind(share.id).run();
  return serveObject(c, target);
});
