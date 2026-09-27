import { expect, test } from "vitest";

test("main module imports safely without #root", async () => {
  await expect(import("./main")).resolves.toBeDefined();
});
