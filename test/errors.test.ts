import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { Hono } from "hono";
import { errors, errorHandler } from "../server/lib/errors";

test("errorHandler formats HttpError", async () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.get("/boom", () => { throw errors.conflict("名称已存在"); });
  const res = await app.request("/boom");
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: { code: "CONFLICT", message: "名称已存在" } });
});

test("unknown errors become 500 envelope", async () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.get("/boom", () => { throw new Error("x"); });
  const res = await app.request("/boom");
  expect(res.status).toBe(500);
  expect((await res.json()).error.code).toBe("INTERNAL");
});

test("health still ok via SELF (error handler wired)", async () => {
  const res = await SELF.fetch("https://example.com/api/health");
  expect(res.status).toBe(200);
});
