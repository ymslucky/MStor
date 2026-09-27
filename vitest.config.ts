import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(projectRoot, "migrations"));
  return {
    test: {
      setupFiles: ["./test/setup.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.jsonc" },
          miniflare: {
            bindings: {
              SESSION_SECRET: "test-session-secret",
              OIDC_CLIENT_SECRET: "test-oidc-secret",
              R2_ACCESS_KEY_ID: "test-r2-key",
              R2_SECRET_ACCESS_KEY: "test-r2-secret",
              TEST_MIGRATIONS: migrations,
            },
          },
        },
      },
    },
  };
});
