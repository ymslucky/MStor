import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError, errors } from "../lib/errors";
import { pbkdf2Hash, pbkdf2Verify, randomToken } from "../lib/crypto";
import { getNode, isDescendant, listChildren } from "../lib/nodes";
import { parseIds } from "../data/trash";
import { serveObject } from "../lib/serve";
import { assertSharePasswordAllowed, clearSharePasswordFailures, isDownloadIntent, recordSharePasswordFailure, releaseDownloadSlot, takeDownloadSlot } from "../data/shares";
import { auditStmt, recordAudit } from "../lib/audit";
import type { NodeRow, ShareRow } from "../types";

export const shares = new Hono<AppEnv>();

shares.post("/", async (c) => {
  const { nodeId, expiresInDays, password, maxDownloads, oneTime } = await c.req.json<{
    nodeId: string; expiresInDays?: number; password?: string; maxDownloads?: number; oneTime?: boolean;
  }>();
  // getNode 不过滤 deleted_at；分享目标必须是未删除节点
  const node = await getNode(c.env.DB, c.get("workspace").id, nodeId);
  if (!node || node.deleted_at) throw errors.notFound();
  if (expiresInDays !== undefined && (!Number.isFinite(expiresInDays) || expiresInDays <= 0)) {
    throw errors.badRequest("有效期须为正数天数");
  }
  // 一次性 = 最多下载 1 次；显式 maxDownloads 优先
  const limit = oneTime ? 1 : maxDownloads;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 10000)) {
    throw errors.badRequest("maxDownloads 须为 1-10000 的整数");
  }
  const token = randomToken(16);
  const shareId = randomToken(12);
  const passwordHash = password ? await pbkdf2Hash(password) : null;
  const expiresAt = expiresInDays ? Date.now() + expiresInDays * 86400000 : null;
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO shares (id, workspace_id, node_id, token, password_hash, expires_at, max_downloads, downloads, created_at, revoked_at) VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,NULL)"
    ).bind(shareId, c.get("workspace").id, nodeId, token, passwordHash, expiresAt, limit ?? null, Date.now()),
    auditStmt(c.env.DB, {
      workspaceId: c.get("workspace").id,
      actorId: c.get("selfId"),
      action: "share.create",
      targetId: nodeId,
      resourceType: "share",
      resourceId: shareId,
      meta: { expiresAt, maxDownloads: limit ?? null, hasPassword: !!passwordHash },
      category: "share",
      severity: "info",
      requestId: c.req.header("cf-ray") ?? null,
    }),
  ]);
  return c.json({ token, url: `${c.env.PUBLIC_URL}/s/${token}` }, 201);
});

shares.get("/", async (c) => {
  // CROSS JOIN 锁定 shares 驱动：idx_shares_active 有序扫描 + 每行 PK 回表，
  // 读行数 = 分享数（普通 JOIN 会被 planner 改成 nodes 侧 owner 索引全扫）且免 TEMP B-TREE 排序
  const { results } = await c.env.DB.prepare(
    // 显式列：不要把 password_hash（或 workspace_id 等内部列）透传给前端
    `SELECT s.id, s.node_id, s.token, s.expires_at, s.downloads, s.max_downloads, s.last_download_at, s.created_at,
            n.name AS node_name, n.is_dir AS node_is_dir, n.size AS node_size
     FROM shares s CROSS JOIN nodes n ON n.id = s.node_id
     WHERE n.workspace_id = ?1 AND s.revoked_at IS NULL ORDER BY s.created_at DESC`
  ).bind(c.get("workspace").id).all();
  return c.json({ shares: results });
});

shares.delete("/:id", async (c) => {
  const res = await c.env.DB.prepare(
    `UPDATE shares SET revoked_at = ?1
     WHERE id = ?2 AND node_id IN (SELECT id FROM nodes WHERE workspace_id = ?3)`
  ).bind(Date.now(), c.req.param("id"), c.get("workspace").id).run();
  if (!res.meta.changes) throw errors.notFound();
  await recordAudit(c.env.DB, {
    workspaceId: c.get("workspace").id,
    actorId: c.get("selfId"),
    action: "share.revoke",
    targetId: c.req.param("id"),
    resourceType: "share",
    resourceId: c.req.param("id"),
    category: "share",
    severity: "warn",
    requestId: c.req.header("cf-ray") ?? null,
  });
  return c.json({ ok: true });
});

// 批量撤销：owner 作用域逐条 UPDATE，单项失败（他人/不存在）记入 failed 不阻断
shares.post("/batch-revoke", async (c) => {
  const ids = parseIds(await c.req.json());
  const userId = c.get("workspace").id;
  let revoked = 0;
  const failed: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const res = await c.env.DB.prepare(
      `UPDATE shares SET revoked_at = ?1
       WHERE id = ?2 AND node_id IN (SELECT id FROM nodes WHERE workspace_id = ?3)`
    ).bind(Date.now(), id, userId).run();
    if (res.meta.changes) revoked++;
    else failed.push({ id, reason: "分享不存在" });
  }
  if (revoked > 0) {
    await recordAudit(c.env.DB, {
      workspaceId: userId,
      actorId: c.get("selfId"),
      action: "share.batch_revoke",
      meta: { requested: ids.length, revoked, failed: failed.length },
      category: "share",
      severity: "warn",
      requestId: c.req.header("cf-ray") ?? null,
    });
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
    await assertSharePasswordAllowed(c, token);
    const pw = c.req.header("x-share-password");
    if (!pw) throw new HttpError(401, "SHARE_PASSWORD", "需要提取码");
    if (!(await pbkdf2Verify(pw, share.password_hash))) {
      const blocked = await recordSharePasswordFailure(c, token);
      if (blocked) throw new HttpError(429, "SHARE_RATE_LIMITED", "提取码尝试次数过多，请稍后再试");
      throw new HttpError(401, "SHARE_PASSWORD", "提取码不正确，请重试");
    }
    await clearSharePasswordFailures(c, token);
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
  const children = await listChildren(c.env.DB, node.workspace_id, node.id);
  return c.json({
    ...base,
    children: children.map((x) => ({ id: x.id, name: x.name, isDir: !!x.is_dir, size: x.size, mime: x.mime })),
  });
});

publicShares.on(["GET", "HEAD"], "/:token/raw/:fileId", async (c) => {
  const { share, node } = await loadShare(c, c.req.param("token"));
  const fileId = c.req.param("fileId");
  const target = await getNode(c.env.DB, node.workspace_id, fileId);
  // 回收站内的后代文件不可通过公开链接下载（getNode 不过滤 deleted_at，需显式排除）
  if (!target || target.is_dir || target.deleted_at || !(await isDescendant(c.env.DB, node.workspace_id, node.id, fileId))) {
    throw errors.notFound();
  }

  const isHead = c.req.method === "HEAD";
  // 只有「下载意图」占名额：Range（拖进度条）、预览、HEAD 都不计数
  const slot = !isHead && isDownloadIntent(c) ? await takeDownloadSlot(c, share) : null;
  let res: Response;
  try {
    res = await serveObject(c, target);
  } catch (e) {
    // 内容没发出去就不该计数（R2 缺对象等）
    if (slot) await releaseDownloadSlot(c, share, slot.dedupeKey);
    throw e;
  }
  if (isHead) return new Response(null, { status: res.status, headers: res.headers });
  return res;
});

// 文件夹分享的子树浏览：dirId 必须在分享根子树内（含根本身）且未删除
publicShares.get("/:token/children/:dirId", async (c) => {
  const { node } = await loadShare(c, c.req.param("token"));
  if (!node.is_dir) throw errors.notFound();
  const dirId = c.req.param("dirId");
  if (!(await isDescendant(c.env.DB, node.workspace_id, node.id, dirId))) throw errors.notFound();
  const dir = await getNode(c.env.DB, node.workspace_id, dirId);
  if (!dir || !dir.is_dir || dir.deleted_at) throw errors.notFound();
  const children = await listChildren(c.env.DB, node.workspace_id, dirId);
  return c.json({
    name: dir.name,
    children: children.map((x) => ({ id: x.id, name: x.name, isDir: !!x.is_dir, size: x.size, mime: x.mime })),
  });
});
