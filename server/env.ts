import type { Hono } from "hono";
import type { UserRow } from "./types";

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  OIDC_ISSUER: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
  PUBLIC_URL: string;
  SESSION_SECRET: string;
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  DEFAULT_QUOTA_BYTES: string;
  SMALL_FILE_LIMIT: string;
  TRASH_RETENTION_DAYS: string;
};

export type AppEnv = { Bindings: Env; Variables: { user: UserRow } };
export type App = Hono<AppEnv>;
