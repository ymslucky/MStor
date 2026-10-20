import { HttpError, errors } from "../lib/errors";
import { moveNode } from "../lib/nodes";

/** 撤销窗口：30 秒（前端 Snackbar 的存活期；过期后只能走回收站或手动改回） */
export const UNDO_WINDOW_MS = 30_000;

export interface OperationRow {
  id: string;
  workspace_id: string;
  actor_id: string;
  kind: "move" | "rename";
  node_id: string;
  payload: string;
  created_at: number;
  expires_at: number;
  undone_at: number | null;
}

/** 记录一次可撤销的移动/改名：载荷是逆操作所需的最小信息（旧父 + 旧名） */
export async function recordMoveUndo(
  db: D1Database,
  input: { workspaceId: string; actorId: string; nodeId: string; oldParentId: string; oldName: string },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO operations (id, workspace_id, actor_id, kind, node_id, payload, created_at, expires_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
    )
    .bind(
      id,
      input.workspaceId,
      input.actorId,
      input.oldParentId === "" ? "move" : "move",
      input.nodeId,
      JSON.stringify({ parentId: input.oldParentId, name: input.oldName }),
      now,
      now + UNDO_WINDOW_MS,
    )
    .run();
  return id;
}

/** 撤销：窗口内 + 未被撤销过 + 同 workspace；逆操作复用 moveNode（会一并平移子树路径） */
export async function undoOperation(db: D1Database, workspaceId: string, opId: string): Promise<void> {
  const row = await db
    .prepare("SELECT * FROM operations WHERE id = ?1 AND workspace_id = ?2")
    .bind(opId, workspaceId)
    .first<OperationRow>();
  if (!row) throw errors.notFound();
  if (row.undone_at) throw errors.conflict("该操作已撤销");
  if (Date.now() > row.expires_at) throw new HttpError(410, "UNDO_EXPIRED", "撤销窗口已过（30 秒）");
  const payload = JSON.parse(row.payload) as { parentId: string; name: string };
  await moveNode(db, workspaceId, row.node_id, payload.parentId, payload.name);
  await db.prepare("UPDATE operations SET undone_at = ?1 WHERE id = ?2").bind(Date.now(), opId).run();
}
