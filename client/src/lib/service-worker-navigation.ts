/**
 * Service Worker 导航回退排除表。
 * `/cdn-cgi/*` 是 Cloudflare Access 登录/授权回调，必须走网络，
 * 否则旧 SW 返回缓存 SPA shell 会让登录停在 authorized 页。
 */
export const navigateFallbackDenylist: RegExp[] = [/^\/api\//, /^\/cdn-cgi\//];

export function shouldBypassNavigateFallback(pathname: string): boolean {
  return navigateFallbackDenylist.some((pattern) => pattern.test(pathname));
}
