import type { Hono } from "hono";
import type { UserRow, WorkspaceRole, WorkspaceRow } from "./types";

/** 认证：Cloudflare Access（Zero Trust）在边缘完成登录并向受保护请求注入 Cf-Access-Jwt-Assertion，
 *  Worker 内 jose 验签（iss = team domain / aud = 应用 AUD / RS256）。AUTH_MODE=dev 仅供本地 wrangler dev。 */
export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN: string;      // https://<team>.cloudflareaccess.com
  ACCESS_AUD: string;              // Worker 级 Access 应用的 AUD tag（只信任本应用签发的 token）
  AUTH_MODE: string;               // "access"（部署态）| "dev"（仅本地 .dev.vars，身份取 x-dev-email）
  ACCESS_PROVISION: string;        // "on" | "off"：未知 Access 身份是否自动建号（迁移窗口 off，防双账号）
  ACCESS_CERTS_JSON?: string;      // 测试注入 JWKS（生产留空，走 /cdn-cgi/access/certs）
  DEV_AUTH_EMAIL?: string;         // dev 模式身份邮箱（.dev.vars）
  PUBLIC_URL: string;
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  DEFAULT_QUOTA_BYTES: string;
  SMALL_FILE_LIMIT: string;
  TRASH_RETENTION_DAYS: string;
};

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: UserRow; // 当前身份（x-act-as 之后可能已是目标用户）
    workspace: WorkspaceRow; // 当前租户：所有数据查询的隔离维度
    role: WorkspaceRole; // 当前用户在该租户的角色
    selfId: string; // 会话原始用户 id（act-as 之前）
    selfUser: UserRow; // 会话原始用户行
  };
};
export type App = Hono<AppEnv>;
