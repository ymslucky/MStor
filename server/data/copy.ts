import { assertQuota, childPath, getNode, isDescendant, resolveParent, subtreePrefix, subtreeRange, uniqueName } from "../lib/nodes";
import { errors } from "../lib/errors";
import { storageDeltaStmt } from "./storage";

/** 单次复制的节点上限：一条 batch 里几百条 INSERT 已经很重，超出让客户端分批 */
const MAX_COPY_NODES = 500;

interface CopyRow {
  id: string;
  parent_id: string;
  path: string;
  name: string;
  is_dir: 0 | 1;
  r2_key: string | null;
  size: number | null;
  mime: string | null;
  sha256: string | null;
}

/**
 * 复制节点（含目录整棵子树）：
 * - R2 对象**共享**（同 r2_key），物理字节不翻倍；
 * - 配额按逻辑字节计（与存储治理口径一致），插入与配额更新同一个 batch；
 * - 后代按 path 升序处理，保证父先于子建立映射。
 */
export async function copyNode(
  db: D1Database,
  workspaceId: string,
  actorId: string | null,
  srcId: string,
  targetParentId: string,
): Promise<{ id: string; name: string; copied: number }> {
  const src = await getNode(db, workspaceId, srcId);
  if (!src) throw errors.notFound();
  const parent = await resolveParent(db, workspaceId, targetParentId);
  if (!parent || !parent.is_dir) throw errors.badRequest("目标目录不存在");
  if (src.is_dir && (await isDescendant(db, workspaceId, src.id, parent.id))) {
    throw errors.badRequest("不能复制到自身子目录");
  }

  const { lo, hi } = subtreeRange(subtreePrefix(src));
  const { results: rows } = await db.prepare(
    `SELECT id, parent_id, path, name, is_dir, r2_key, size, mime, sha256 FROM nodes
     WHERE workspace_id = ?1 AND deleted_at IS NULL AND (id = ?2 OR (path >= ?3 AND path < ?4))
     ORDER BY path ASC`,
  ).bind(workspaceId, src.id, lo, hi).all<CopyRow>();
  if (rows.length > MAX_COPY_NODES) throw errors.badRequest(`单次最多复制 ${MAX_COPY_NODES} 个节点，请分批`);

  const bytes = rows.reduce((sum, r) => sum + (r.is_dir ? 0 : (r.size ?? 0)), 0);
  if (bytes > 0) await assertQuota(db, workspaceId, bytes);

  const rootName = await uniqueName(db, workspaceId, parent.id, src.name);
  const rootParentPath = childPath(parent);
  const now = Date.now();
  const insert = db.prepare(
    "INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, sha256, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)",
  );
  const mapping = new Map<string, { newId: string; newPath: string }>();
  const stmts: D1PreparedStatement[] = [];

  const newRootId = crypto.randomUUID();
  mapping.set(src.id, { newId: newRootId, newPath: rootParentPath });
  stmts.push(insert.bind(newRootId, workspaceId, actorId, parent.id, rootParentPath, rootName, src.is_dir, src.r2_key, src.size, src.mime, src.sha256, now));

  for (const r of rows) {
    if (r.id === src.id) continue;
    const parentMapping = mapping.get(r.parent_id);
    if (!parentMapping) continue; // 父未建映射（异常数据），跳过而不是写出断链
    const newId = crypto.randomUUID();
    const newPath = `${parentMapping.newPath}${parentMapping.newId}/`;
    mapping.set(r.id, { newId, newPath });
    stmts.push(insert.bind(newId, workspaceId, actorId, parentMapping.newId, newPath, r.name, r.is_dir, r.r2_key, r.size, r.mime, r.sha256, now));
  }

  stmts.push(db.prepare("UPDATE workspaces SET used_bytes = used_bytes + ?1 WHERE id = ?2").bind(bytes, workspaceId));
  stmts.push(storageDeltaStmt(db, workspaceId, { active: bytes }));
  await db.batch(stmts);
  return { id: newRootId, name: rootName, copied: rows.length };
}
