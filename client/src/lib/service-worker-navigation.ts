/**
 * Service Worker 导航回退排除表。
 * `/cdn-cgi/*` 是 Cloudflare Access 登录/授权回调，必须走网络，
 * 否则旧 SW 返回缓存 SPA shell 会让登录停在 authorized 页。
 * `/auth/*` 是前端会话续期入口（/auth/renew）：同样必须直达边缘，
 * 否则 Access 会话过期时「刷新」被导航缓存吞掉，页面会卡在打转的空白页。
 */
export const navigateFallbackDenylist: RegExp[] = [/^\/api\//, /^\/cdn-cgi\//, /^\/auth\//];

export function shouldBypassNavigateFallback(pathname: string): boolean {
  return navigateFallbackDenylist.some((pattern) => pattern.test(pathname));
}
