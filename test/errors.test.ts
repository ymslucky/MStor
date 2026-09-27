import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { Hono } from "hono";
import { errors, errorHandler } from "../server/lib/errors";
import { seedUser, sessionHeaders } from "./helpers";

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
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INTERNAL");
});

test("health still ok via SELF (error handler wired)", async () => {
  const res = await SELF.fetch("https://example.com/api/health");
  expect(res.status).toBe(200);
});

test("unmatched route returns 404 envelope via SELF", async () => {
  // /api/* 受 session 中间件保护且为 run_worker_first，404 envelope 需带合法 session 探测
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/nope", { headers: await sessionHeaders(u) });
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "资源不存在" } });
});

test("invalid JSON body maps to 400 BAD_REQUEST", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/me/webdav-password", {
    method: "PUT",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: "not-json",
  });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("BAD_REQUEST");
});
