import type { Context } from "hono";
import type { AppEnv } from "../env";

/** 结构化日志字段：便于在观测平台按 requestId 串联一次请求、按 code 聚合错误 */
export interface LogFields {
  requestId?: string;
  userId?: string;
  route?: string;
  code?: string;
  status?: number;
  [key: string]: unknown;
}

/**
 * 输出单行 JSON 日志（console.error → wrangler/观测平台可解析）。
 * 仅使用 error/warn 级别：项目 ESLint 禁止裸 console.log。
 */
function emit(level: "error" | "warn", message: string, fields: LogFields) {
  const line = JSON.stringify({ level, message, ...fields });
  if (level === "error") console.error(line);
  else console.warn(line);
}

/** 从请求上下文提取通用字段；未鉴权路由可能尚无 user，需容错 */
function baseFields(c: Context<AppEnv>): LogFields {
  const fields: LogFields = {
    requestId: c.req.header("cf-ray") ?? undefined,
    route: `${c.req.method} ${new URL(c.req.url).pathname}`,
  };
  try {
    const user = c.get("user");
    if (user) fields.userId = user.id;
  } catch {
    /* 未经过 session 中间件的路由 c.get("user") 会抛错，忽略 */
  }
  return fields;
}

export const logger = {
  error(message: string, c: Context<AppEnv>, fields: LogFields = {}) {
    emit("error", message, { ...baseFields(c), ...fields });
  },
  warn(message: string, c: Context<AppEnv>, fields: LogFields = {}) {
    emit("warn", message, { ...baseFields(c), ...fields });
  },
};