import { SESSION_KEYS, STORAGE_KEYS, getSession, getString, removeSession, setSession } from "../lib/storage";
import { renewSession } from "../lib/renew";

export class ApiError extends Error {
  /** 失败请求的路径：用于区分「业务接口会话过期」与「公开分享接口的提取码错误」 */
  path?: string;
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// 常见错误码 → 用户友好文案（服务端原文已可读的码不在表内，保留原文）
const FRIENDLY_MESSAGES: Record<string, string> = {
  RATE_LIMITED: "操作过于频繁，请稍后再试",
  NOT_FOUND: "文件不存在或已被删除",
  INTERNAL: "服务暂时不可用，请稍后重试",
  NETWORK: "网络连接异常，请检查网络后重试",
  FORBIDDEN: "没有权限执行此操作",
};

/** 统一错误展示文案：映射常见错误码，保留服务端已可读的原文 */
export function friendlyMessage(e: unknown): string {
  if (e instanceof ApiError) return FRIENDLY_MESSAGES[e.code] ?? e.message;
  if (e instanceof DOMException && e.name === "AbortError") return "已取消";
  // fetch 断网抛 TypeError("Failed to fetch")：不要把这个英文原文直接展示给用户
  if (e instanceof TypeError || (e instanceof Error && /failed to fetch|networkerror/i.test(e.message))) {
    return FRIENDLY_MESSAGES.NETWORK;
  }
  return e instanceof Error ? e.message : "操作失败，请重试";
}

// —— 会话重登策略（Cloudflare Access）——
// 「曾登录过」的会话中途过期：定向导航到 SW 豁免路径 /auth/renew 触发边缘重登。
// 不能原地整页刷新：SW 导航回退会用缓存直接返回同 URL，请求到不了边缘（Access 无从 302 去 IdP），
// 页面一轮轮刷新打转 = 空白页。守卫：本轮生命周期只跳一次（redirecting），
// 跨刷新 10s 内也只跳一次（renewAt）——续期后仍 401 属非会话问题，交给提示页而不是无限刷新。
let redirecting = false;
const RENEW_GUARD_MS = 10_000;

export function markSessionActive(): void {
  setSession(SESSION_KEYS.authed, "1");
  removeSession(SESSION_KEYS.renewAt); // 登录已恢复：清除续期守卫，下次过期可再续期
}

export function clearSessionFlag(): void {
  removeSession(SESSION_KEYS.authed);
  removeSession(SESSION_KEYS.renewAt);
}

/** 会话过期时调用：曾登录过 → 经 /auth/renew 续期一次并返回 true；否则返回 false（由调用方渲染未授权提示页） */
export function handleSessionExpired(): boolean {
  if (redirecting) return true;
  const authed = getSession(SESSION_KEYS.authed) === "1";
  if (!authed) return false;
  // 刚刚续期过仍 401（如边缘放行但后端验签失败）：不再跳转，避免整页重载死循环
  const now = Date.now();
  if (now - Number(getSession(SESSION_KEYS.renewAt) ?? 0) < RENEW_GUARD_MS) return false;
  redirecting = true;
  setSession(SESSION_KEYS.renewAt, String(now));
  renewSession();
  return true;
}

interface ApiInit extends Omit<RequestInit, "body"> {
  json?: unknown;
  body?: BodyInit | null;
  /** 不附带 x-act-as 头：全局管理类操作（如 admin 用户管理）与空间无关 */
  skipActAs?: boolean;
}

// 统一封装：错误 envelope → ApiError。401 只抛错不跳转，重定向策略见 handleSessionExpired
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { skipActAs, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.json !== undefined) headers.set("content-type", "application/json");
  // Access 会话过期时对带此头的 AJAX 回 401（而非 302 HTML），前端据此触发整页重登
  headers.set("x-requested-with", "XMLHttpRequest");
  // act-as 时必须由服务端解析目标用户的默认空间：浏览器里残留的 x-workspace
  // 属于管理员自己的空间，会让目标用户的文件请求变成 404。
  const actAs = skipActAs ? null : getString(STORAGE_KEYS.actAs);
  if (actAs) headers.set("x-act-as", actAs);
  // 当前空间：切空间 = 带 x-workspace 头；未设置时由服务端回落到默认空间
  if (!actAs) {
    const workspace = getString(STORAGE_KEYS.workspace);
    if (workspace) headers.set("x-workspace", workspace);
  }
  const res = await fetch(path, {
    ...rest,
    headers,
    body: rest.json !== undefined ? JSON.stringify(rest.json) : (rest.body as BodyInit | null | undefined),
  });
  if (res.status === 401 && !path.startsWith("/api/s/")) {
    const err = new ApiError(401, "UNAUTHORIZED", "请先登录");
    err.path = path;
    throw err;
  }
  if (!res.ok) {
    let code = "INTERNAL";
    let message = "请求失败";
    try {
      const data = (await res.json()) as { error?: { code?: string; message?: string } };
      code = data.error?.code ?? code;
      message = data.error?.message ?? message;
    } catch {
      // 非 JSON 错误体，保留默认文案
    }
    const err = new ApiError(res.status, code, FRIENDLY_MESSAGES[code] ?? message);
    err.path = path;
    throw err;
  }
  return (await res.json()) as T;
}
