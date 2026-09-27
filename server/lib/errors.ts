import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class HttpError extends Error {
  constructor(public status: ContentfulStatusCode, public code: string, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export const errors = {
  unauthorized: () => new HttpError(401, "UNAUTHORIZED", "请先登录"),
  forbidden: (m = "无权访问") => new HttpError(403, "FORBIDDEN", m),
  quotaExceeded: () => new HttpError(403, "QUOTA_EXCEEDED", "空间配额不足"),
  notFound: () => new HttpError(404, "NOT_FOUND", "资源不存在"),
  conflict: (m = "名称已存在") => new HttpError(409, "CONFLICT", m),
  badRequest: (m = "请求参数错误") => new HttpError(400, "BAD_REQUEST", m),
};

export async function errorHandler(e: Error, c: Context) {
  if (e instanceof HttpError) {
    return c.json({ error: { code: e.code, message: e.message } }, e.status);
  }
  // JSON body 解析失败（c.req.json() 抛 SyntaxError），后续所有 JSON 路由统一走此映射
  if (e instanceof SyntaxError) {
    return c.json({ error: { code: "BAD_REQUEST", message: "请求体不是合法 JSON" } }, 400);
  }
  console.error(e);
  return c.json({ error: { code: "INTERNAL", message: "服务器内部错误" } }, 500);
}
