import { describe, expect, test } from "vitest";
import { shouldBypassNavigateFallback } from "./service-worker-navigation";

describe("PWA navigation fallback bypass", () => {
  test("lets Cloudflare Access authorization callbacks reach the network", () => {
    expect(shouldBypassNavigateFallback("/cdn-cgi/access/authorized")).toBe(true);
  });

  test("keeps API requests outside the SPA fallback", () => {
    expect(shouldBypassNavigateFallback("/api/me")).toBe(true);
  });

  test("still uses the SPA fallback for application routes", () => {
    expect(shouldBypassNavigateFallback("/")).toBe(false);
    expect(shouldBypassNavigateFallback("/shares")).toBe(false);
  });
});
