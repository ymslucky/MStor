import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

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
              SESSION_SECRET: "test-session-secret",
              OIDC_CLIENT_SECRET: "test-oidc-secret",
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
