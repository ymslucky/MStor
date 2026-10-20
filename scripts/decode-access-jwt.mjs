#!/usr/bin/env node
/**
 * 解码 Cloudflare Access 注入的 JWT 声明（诊断用，**不验签**）。
 *
 * 用途：P0.5 需要确认 GitHub 身份下 JWT 到底带不带 email、sub 长什么样，以决定
 * 邀请匹配是按 access_sub（推荐，稳定）还是按 email（依赖 GitHub 邮箱可见性）。
 *
 * 用法：浏览器打开站点 → DevTools → Network → 任一 /api/* 请求 → Request Headers →
 *       复制 cf-access-jwt-assertion 的值，然后：
 *       node scripts/decode-access-jwt.mjs "<粘贴的 token>"
 *
 * 安全提醒：这是你自己的会话凭据，等价于登录态。不要贴进任何第三方网站（含各种在线 JWT 解码器），
 * 用完可从 Zero Trust 控制台撤销会话。
 */
const token = (process.argv[2] ?? "").trim();
if (!token) {
  console.error("用法: node scripts/decode-access-jwt.mjs \"<cf-access-jwt-assertion>\"");
  process.exit(1);
}
const parts = token.split(".");
if (parts.length !== 3) {
  console.error("不是合法的 JWT（应为三段）");
  process.exit(1);
}
const decode = (seg) => JSON.parse(Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
const header = decode(parts[0]);
const payload = decode(parts[1]);
const now = Math.floor(Date.now() / 1000);
const iso = (s) => (typeof s === "number" ? new Date(s * 1000).toISOString() : String(s));

console.log("header:", JSON.stringify(header));
console.log("iss      :", payload.iss);
console.log("aud      :", JSON.stringify(payload.aud));
console.log("sub      :", payload.sub ?? "(缺失)");
console.log("email    :", payload.email ?? "(缺失 —— GitHub 邮箱可能私有，这正是要确认的)");
console.log("common_name:", payload.common_name ?? "(无)");
console.log("iat/exp  :", iso(payload.iat), "→", iso(payload.exp), payload.exp < now ? "【已过期】" : "【有效】");
console.log("\n结论口径：若 email 缺失或为 users.noreply.github.com，邀请匹配必须按 access_sub；");
console.log("         若 email 存在且稳定，可两者并存：优先 access_sub，email 仅作邀请预匹配。");
