import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            SESSION_SECRET: "test-session-secret",
            OIDC_CLIENT_SECRET: "test-oidc-secret",
            R2_ACCESS_KEY_ID: "test-r2-key",
            R2_SECRET_ACCESS_KEY: "test-r2-secret",
          },
        },
      },
    },
  },
});
