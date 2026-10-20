import { HttpError } from "../lib/errors";
import { getSetting } from "../lib/settings";
import { notifyManagers } from "./notifications";

/**
 * 存储治理（方案 P2 B1）：workspaces.used_bytes 是配额真相，storage_stats 是解释性四分项。
 *
 * 写入策略（刻意的取舍）：
 * - 上传等热路径用「增量」：一条 upsert 语句，避免全空间扫描；
 * - 删除/还原等低频且批量路径用「重算」：一条 UPDATE + 子查询，天然不漂移。
 * 两者都只维护 active/trash；version/thumb 等版本管理与缩略图落地后再接（当前暂不做版本管理）。
 */

export interface StorageStats {
  active_bytes: number;
  trash_bytes: number;
  version_bytes: number;
  thumb_bytes: number;
}

/** 单一 upsert：行不存在则插入，存在则累加；MAX(0) 防御历史漂移导致负值 */
export function storageDeltaStmt(
  db: D1Database,
  workspaceId: string,
  delta: { active?: number; trash?: number; thumb?: number },
): D1PreparedStatement {
  const active = delta.active ?? 0;
  const trash = delta.trash ?? 0;
  const thumb = delta.thumb ?? 0;
  return db
    .prepare(
      `INSERT INTO storage_stats (workspace_id, active_bytes, trash_bytes, thumb_bytes, updated_at)
       VALUES (?1, MAX(0, ?2), MAX(0, ?3), MAX(0, ?5), ?4)
       ON CONFLICT (workspace_id) DO UPDATE SET
         active_bytes = MAX(0, storage_stats.active_bytes + ?2),
         trash_bytes  = MAX(0, storage_stats.trash_bytes + ?3),
         thumb_bytes  = MAX(0, storage_stats.thumb_bytes + ?5),
         updated_at   = excluded.updated_at`,
    )
    .bind(workspaceId, active, trash, Date.now(), thumb);
}

/** 重算 active/trash（低频路径用）：一条语句，按 workspace 索引有界扫描 */
export function recomputeStorageStatsStmt(db: D1Database, workspaceId: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO storage_stats (workspace_id, active_bytes, trash_bytes, updated_at)
       SELECT ?1,
         (SELECT COALESCE(SUM(size), 0) FROM nodes WHERE workspace_id = ?1 AND is_dir = 0 AND size IS NOT NULL AND deleted_at IS NULL),
         (SELECT COALESCE(SUM(size), 0) FROM nodes WHERE workspace_id = ?1 AND is_dir = 0 AND size IS NOT NULL AND deleted_at IS NOT NULL),
         ?2
       WHERE true
       ON CONFLICT (workspace_id) DO UPDATE SET
         active_bytes = excluded.active_bytes,
         trash_bytes  = excluded.trash_bytes,
         updated_at   = excluded.updated_at`,
    )
    .bind(workspaceId, Date.now());
}

export async function recomputeStorageStats(db: D1Database, workspaceId: string): Promise<void> {
  await recomputeStorageStatsStmt(db, workspaceId).run();
}

export async function readStorageStats(db: D1Database, workspaceId: string): Promise<StorageStats> {
  const row = await db
    .prepare("SELECT active_bytes, trash_bytes, version_bytes, thumb_bytes FROM storage_stats WHERE workspace_id = ?1")
    .bind(workspaceId)
    .first<StorageStats>();
  return row ?? { active_bytes: 0, trash_bytes: 0, version_bytes: 0, thumb_bytes: 0 };
}

/** 全局预算（整站 R2 容量上限）：settings.global_quota_bytes 优先，缺省 10 GiB（R2 免费额度量级） */
export const DEFAULT_GLOBAL_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;

export async function globalQuotaBytes(env: { DB: D1Database }): Promise<number> {
  const configured = await getSetting(env as never, "global_quota_bytes");
  const parsed = configured === null ? NaN : Number(configured);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GLOBAL_QUOTA_BYTES;
}

/** 超出全局预算时用 507（Insufficient Storage）：与「个人配额不足 403」区分，前端文案不同 */
export function storageFullError(used: number, quota: number): HttpError {
  return new HttpError(507, "STORAGE_FULL", `站点存储已满（${used}/${quota} 字节），请联系管理员扩容或清理回收站`);
}

/** 上传前校验整站预算：一次 SUM（workspaces 行数=租户数，扫描成本可忽略） */
export async function assertGlobalBudget(env: { DB: D1Database }, extraBytes: number): Promise<void> {
  const quota = await globalQuotaBytes(env);
  const row = await env.DB.prepare("SELECT COALESCE(SUM(used_bytes), 0) AS total FROM workspaces").first<{ total: number }>();
  const used = row?.total ?? 0;
  if (used + extraBytes > quota) throw storageFullError(used, quota);
}

/** 用量水位：前端据此显示 80%/95%/100% 的提示与阻断文案 */
export async function notifyIfStorageLevelHigh(env: { DB: D1Database }, workspaceId: string): Promise<void> {
  const ws = await env.DB.prepare("SELECT used_bytes, quota_bytes FROM workspaces WHERE id = ?1").bind(workspaceId).first<{ used_bytes: number; quota_bytes: number }>();
  if (!ws || ws.quota_bytes <= 0) return;
  const level = storageLevel(ws.used_bytes, ws.quota_bytes);
  if (level !== "critical" && level !== "full") return;
  const pct = Math.round((ws.used_bytes / ws.quota_bytes) * 100);
  await notifyManagers(env.DB, {
    workspaceId,
    kind: "storage.high",
    title: pct >= 100 ? "空间已满" : `空间使用已达 ${pct}%`,
    body: "清理回收站或调整配额后可继续上传",
    link: "/settings",
    dedupe: true,
  });
}

export function storageLevel(usedBytes: number, quotaBytes: number): "ok" | "warn" | "critical" | "full" {
  if (quotaBytes <= 0) return "ok";
  const ratio = usedBytes / quotaBytes;
  if (ratio >= 1) return "full";
  if (ratio >= 0.95) return "critical";
  if (ratio >= 0.8) return "warn";
  return "ok";
}
