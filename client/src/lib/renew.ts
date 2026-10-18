// 会话续期（Cloudflare Access）：PWA service worker 的导航回退会把「同 URL 整页刷新」
// 直接从缓存返回，请求到不了边缘，Access 无从接管重登——表现就是刷新打转/空白页。
// 续期统一改走 SW 豁免路径 RENEW_PATH（见 service-worker-navigation.ts 的 denylist），
// 由边缘裁决：会话仍有效 → 直接回 SPA；已过期 → 302 到 IdP，登录后回原页。
export const RENEW_PATH = "/auth/renew";

/** 导航到 /auth/renew 触发一次会话续期（location.replace：不在历史里留下过期页） */
export function renewSession(): void {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`${RENEW_PATH}?next=${encodeURIComponent(next)}`);
}

/** 校验 /auth/renew 的 next 参数：仅接受同源应用内路径（防开放重定向与自回环） */
export function nextTarget(raw: string | null): string {
  if (!raw) return "/";
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return "/";
    if (u.pathname === RENEW_PATH || u.pathname.startsWith("/cdn-cgi/")) return "/";
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return "/";
  }
}
