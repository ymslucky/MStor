export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// —— 会话重登策略（防 IAM authorize 端点限流）——
// 未登录的首次访问渲染登录落地页（不自动跳转）；「曾登录过」的会话中途过期才自动重登，
// 且每轮页面生命周期只跳一次（redirecting 守卫），避免并发 401 造成 authorize 请求风暴。
const AUTHED_FLAG = "mstor_authed";
let redirecting = false;

export function markSessionActive(): void {
  try {
    sessionStorage.setItem(AUTHED_FLAG, "1");
  } catch {
    // 存储不可用时忽略：仅影响自动重登，落地页仍可用
  }
}

export function clearSessionFlag(): void {
  try {
    sessionStorage.removeItem(AUTHED_FLAG);
  } catch {
    // 同上
  }
}

/** 会话过期时调用：曾登录过 → 跳登录页（一次性）并返回 true；否则返回 false（由调用方渲染落地页） */
export function handleSessionExpired(): boolean {
  if (redirecting) return true;
  let authed = false;
  try {
    authed = sessionStorage.getItem(AUTHED_FLAG) === "1";
  } catch {
    authed = false;
  }
  if (authed) {
    redirecting = true;
    window.location.href = "/auth/login";
  }
  return authed;
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
  if (!skipActAs && typeof localStorage !== "undefined") {
    const actAs = localStorage.getItem("mstor_act_as");
    if (actAs) headers.set("x-act-as", actAs);
  }
  const res = await fetch(path, {
    ...rest,
    headers,
    body: rest.json !== undefined ? JSON.stringify(rest.json) : (rest.body as BodyInit | null | undefined),
  });
  if (res.status === 401 && !path.startsWith("/api/s/")) {
    throw new ApiError(401, "UNAUTHORIZED", "请先登录");
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
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}
