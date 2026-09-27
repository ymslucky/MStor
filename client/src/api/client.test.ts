import { afterEach, expect, test, vi } from "vitest";
import { ApiError, api } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("unwraps error envelope into ApiError", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ error: { code: "CONFLICT", message: "名称已存在" } }), { status: 409 }),
  ));
  const err: ApiError = await api("/api/dirs", { method: "POST", json: { name: "x" } }).then(
    () => { throw new Error("should reject"); },
    (e: ApiError) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(409);
  expect(err.code).toBe("CONFLICT");
  expect(err.message).toBe("名称已存在");
});

test("401 on protected api redirects to login", async () => {
  const loc = { href: "" };
  Object.defineProperty(window, "location", { value: loc, configurable: true });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
  await expect(api("/api/files")).rejects.toBeInstanceOf(ApiError);
  expect(loc.href).toBe("/auth/login");
});

test("401 on public share endpoint does NOT redirect", async () => {
  const loc = { href: "" };
  Object.defineProperty(window, "location", { value: loc, configurable: true });
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ error: { code: "SHARE_PASSWORD", message: "需要提取码" } }), { status: 401 }),
  ));
  const err: ApiError = await api("/api/s/tok").then(() => { throw new Error("should reject"); }, (e: ApiError) => e);
  expect(err.code).toBe("SHARE_PASSWORD");
  expect(loc.href).toBe("");
});

test("sends x-act-as header when set", async () => {
  localStorage.setItem("mstor_act_as", "u-123");
  const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await api("/api/files");
  const headers = fetchMock.mock.calls[0]![1]!.headers as Headers;
  expect(headers.get("x-act-as")).toBe("u-123");
  localStorage.removeItem("mstor_act_as");
});
