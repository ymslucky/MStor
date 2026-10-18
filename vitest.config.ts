import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import { TEST_ACCESS_JWKS } from "./test/fixtures/access-keys";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations("migrations");
  return {
    test: {
      setupFiles: ["./test/setup.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "client/**"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.jsonc" },
          miniflare: {
            bindings: {
              // 认证：静态 JWKS 注入（与 fixtures 私钥配对），签发见 test/helpers.ts#signAccessJwt
              ACCESS_TEAM_DOMAIN: "https://test-team.cloudflareaccess.com",
              ACCESS_AUD: "test-aud",
              AUTH_MODE: "access",
              ACCESS_PROVISION: "on",
              ACCESS_CERTS_JSON: JSON.stringify(TEST_ACCESS_JWKS),
              R2_ACCESS_KEY_ID: "test-r2-key",
              R2_SECRET_ACCESS_KEY: "test-r2-secret",
              R2_ENDPOINT: "https://test-account.r2.cloudflarestorage.com/mstor",
              TEST_MIGRATIONS: migrations,
            },
          },
        },
      },
    },
  };
});
