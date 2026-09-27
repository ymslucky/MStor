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

interface ApiInit extends Omit<RequestInit, "body"> {
  json?: unknown;
  body?: BodyInit | null;
}

// 统一封装：错误 envelope → ApiError；受保护接口 401 → 跳登录（公开分享 /api/s/ 除外）
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (typeof localStorage !== "undefined") {
    const actAs = localStorage.getItem("mstor_act_as");
    if (actAs) headers.set("x-act-as", actAs);
  }
  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : (init.body as BodyInit | null | undefined),
  });
  if (res.status === 401 && !path.startsWith("/api/s/")) {
    window.location.href = "/auth/login";
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
