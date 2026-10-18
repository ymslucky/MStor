import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../env";
import { logger } from "./logger";

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
  rateLimited: (m = "操作过于频繁，请稍后再试") => new HttpError(429, "RATE_LIMITED", m),
  badGateway: (m = "上游服务暂时不可用，请稍后重试") => new HttpError(502, "BAD_GATEWAY", m),
};

export async function errorHandler(e: Error, c: Context<AppEnv>) {
  if (e instanceof HttpError) {
    // 5xx 属服务端异常，记录结构化日志（4xx 为可预期的业务拒绝，不刷日志）
    if (e.status >= 500) logger.error("request failed", c, { code: e.code, status: e.status, error: e.message });
    return c.json({ error: { code: e.code, message: e.message } }, e.status);
  }
  // JSON body 解析失败（c.req.json() 抛 SyntaxError），后续所有 JSON 路由统一走此映射
  if (e instanceof SyntaxError) {
    return c.json({ error: { code: "BAD_REQUEST", message: "请求体不是合法 JSON" } }, 400);
  }
  logger.error("unhandled error", c, { code: "INTERNAL", status: 500, error: e.message, stack: e.stack });
  return c.json({ error: { code: "INTERNAL", message: "服务器内部错误" } }, 500);
}
