import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "../lib/errors";
import type { ShareRow } from "../types";

/**
 * 分享下载计数（方案 P2 B3）：
 * - 只有「下载意图」（dl=1 且非 Range）才计数——拖动视频进度条不该耗尽次数；
 * - 计数是**原子扣减**：一条 UPDATE 带全部前置条件，靠 meta.changes 判定成功与否，天然防并发超额；
 * - 同来源 10 分钟内只计一次（dedupe_key 唯一索引），防下载管理器/重试重复计入。
 */
const DEDUPE_WINDOW_MS = 10 * 60_000;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 来源指纹：IP + UA（都只存哈希，不落原文） */
async function sourceFingerprint(c: Context<AppEnv>): Promise<{ ipHash: string; uaHash: string }> {
  const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
  const ua = c.req.header("user-agent") ?? "unknown";
  return { ipHash: await sha256Hex(ip), uaHash: await sha256Hex(ua) };
}

export type DownloadSlot = "counted" | "deduped";

/**
 * 占用一次下载名额。名额不足/已撤销/已过期 → 410 SHARE_EXHAUSTED。
 * 调用方在返回内容失败时应调用 {@link releaseDownloadSlot} 归还名额。
 */
export async function takeDownloadSlot(c: Context<AppEnv>, share: ShareRow): Promise<{ result: DownloadSlot; dedupeKey: string }> {
  const now = Date.now();
  const { ipHash, uaHash } = await sourceFingerprint(c);
  const bucket = Math.floor(now / DEDUPE_WINDOW_MS);
  const dedupeKey = await sha256Hex(`${share.id}|${ipHash}|${uaHash}|${bucket}`);

  // 先登记去重键：唯一索引冲突说明同一来源在同一窗口内已经计过
  const inserted = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO share_downloads (id, workspace_id, share_id, ip_hash, ua_hash, dedupe_key, success, created_at) VALUES (?1,?2,?3,?4,?5,?6,1,?7)",
  ).bind(crypto.randomUUID(), share.workspace_id, share.id, ipHash, uaHash, dedupeKey, now).run();
  if (!inserted.meta.changes) return { result: "deduped", dedupeKey };

  // 原子扣减：撤销/过期/次数上限全部写进 WHERE，避免读-改-写竞态
  const res = await c.env.DB.prepare(
    `UPDATE shares SET downloads = downloads + 1, last_download_at = ?1
     WHERE id = ?2 AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?1)
       AND (max_downloads IS NULL OR downloads < max_downloads)`,
  ).bind(now, share.id).run();
  if (!res.meta.changes) {
    // 没拿到名额：撤销本次去重登记，否则会占住窗口让别人无法计数
    await c.env.DB.prepare("DELETE FROM share_downloads WHERE dedupe_key = ?1").bind(dedupeKey).run();
    throw new HttpError(410, "SHARE_EXHAUSTED", "分享下载次数已用完或已失效");
  }
  return { result: "counted", dedupeKey };
}

/** 内容下发失败（如 R2 缺对象）时归还名额：既不虚增计数，也不留下 10 分钟僵死窗口 */
export async function releaseDownloadSlot(c: Context<AppEnv>, share: ShareRow, dedupeKey: string): Promise<void> {
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE shares SET downloads = MAX(0, downloads - 1) WHERE id = ?1").bind(share.id),
    c.env.DB.prepare("DELETE FROM share_downloads WHERE dedupe_key = ?1").bind(dedupeKey),
  ]);
}

/** 一次下载意图的判定：显式 dl=1 且不是 Range 分段请求 */
export function isDownloadIntent(c: Context<AppEnv>): boolean {
  return c.req.query("dl") === "1" && !c.req.header("range");
}
