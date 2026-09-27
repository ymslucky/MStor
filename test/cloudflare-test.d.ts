import type { Env } from "../server/env";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: Awaited<
      ReturnType<
        typeof import("@cloudflare/vitest-pool-workers/config").readD1Migrations
      >
    >;
  }
}
