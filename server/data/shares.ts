import type { Context } from "hono";
import type { AppEnv } from "../env";
import { randomToken } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import type { ShareRow } from "../types";

/**
 * 分享下载计数：
 * - 只有「下载意图」（dl=1 且非 Range）才计数——拖动视频进度条不该耗尽次数；
 * - 计数是**原子扣减**：一条 UPDATE 带全部前置条件，靠 meta.changes 判定成功与否，天然防并发超额；
 * - 同来源 10 分钟内只计一次（dedupe_key 唯一索引），防下载管理器/重试重复计入。
 */
const DEDUPE_WINDOW_MS = 10 * 60_000;
// 分享提取码尝试限制：同 token+IP 10 分钟内最多 5 次失败，锁定 10 分钟
const AUTH_WINDOW_MS = 10 * 60_000;
const AUTH_BLOCK_MS = 10 * 60_000;
const AUTH_MAX_FAILURES = 5;

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

async function authAttemptKey(c: Context<AppEnv>, token: string): Promise<string> {
  const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
  return sha256Hex(`share-auth|${token}|${ip}`);
}

/** 提取码校验前置：已锁定则直接 429，避免继续跑 PBKDF2。 */
export async function assertSharePasswordAllowed(c: Context<AppEnv>, token: string): Promise<void> {
  const key = await authAttemptKey(c, token);
  const row = await c.env.DB.prepare(
    "SELECT blocked_until FROM share_auth_attempts WHERE key = ?1",
  ).bind(key).first<{ blocked_until: number | null }>();
  if (row?.blocked_until && row.blocked_until > Date.now()) {
    throw new HttpError(429, "SHARE_RATE_LIMITED", "提取码尝试次数过多，请稍后再试");
  }
}

/** 记录一次错误提取码；达到阈值时返回 true（调用方应返回 429）。 */
export async function recordSharePasswordFailure(c: Context<AppEnv>, token: string): Promise<boolean> {
  const key = await authAttemptKey(c, token);
  const now = Date.now();
  const row = await c.env.DB.prepare(
    "SELECT failures, window_start FROM share_auth_attempts WHERE key = ?1",
  ).bind(key).first<{ failures: number; window_start: number }>();
  const inWindow = row && now - row.window_start < AUTH_WINDOW_MS;
  const failures = inWindow ? row.failures + 1 : 1;
  const windowStart = inWindow ? row.window_start : now;
  const blockedUntil = failures >= AUTH_MAX_FAILURES ? now + AUTH_BLOCK_MS : null;
  await c.env.DB.prepare(
    `INSERT INTO share_auth_attempts (key, failures, window_start, blocked_until)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, window_start = excluded.window_start, blocked_until = excluded.blocked_until`,
  ).bind(key, failures, windowStart, blockedUntil).run();
  return blockedUntil !== null;
}

export async function clearSharePasswordFailures(c: Context<AppEnv>, token: string): Promise<void> {
  const key = await authAttemptKey(c, token);
  await c.env.DB.prepare("DELETE FROM share_auth_attempts WHERE key = ?1").bind(key).run();
}

const SHARE_SESSION_MS = 60 * 60_000;

export function shareSessionCookieName(token: string): string {
  return `mstor_share_${token}`;
}

/** 密码校验成功后签发 1 小时 HttpOnly 会话；只存 hash，cookie 泄露不暴露其他分享。 */
export async function createShareSession(
  c: Context<AppEnv>,
  shareId: string,
  token: string,
): Promise<{ name: string; value: string; cookie: string }> {
  const raw = randomToken(24);
  const name = shareSessionCookieName(token);
  const hash = await sha256Hex(raw);
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO share_sessions (id, share_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
  ).bind(hash, shareId, now, now + SHARE_SESSION_MS).run();
  const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
  const cookie = `${name}=${raw}; Path=/api/s/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SHARE_SESSION_MS / 1000)}${secure}`;
  return { name, value: raw, cookie };
}

export async function verifyShareSession(c: Context<AppEnv>, token: string, shareId: string): Promise<boolean> {
  const name = shareSessionCookieName(token);
  const cookie = c.req.header("cookie") ?? "";
  const entry = cookie.split(";").map((x) => x.trim()).find((x) => x.startsWith(name + "="));
  if (!entry) return false;
  const raw = entry.slice(name.length + 1);
  if (!raw) return false;
  const hash = await sha256Hex(raw);
  const row = await c.env.DB.prepare(
    "SELECT share_id, expires_at FROM share_sessions WHERE id = ?1",
  ).bind(hash).first<{ share_id: string; expires_at: number }>();
  return !!row && row.share_id === shareId && row.expires_at > Date.now();
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
