import { afterEach, expect, test, vi } from "vitest";
import { ApiError, api, clearSessionFlag, friendlyMessage, handleSessionExpired, markSessionActive } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSessionFlag();
});

test("已知错误码映射为友好文案（保留原始 code）", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests" } }), { status: 429 }),
  ));
  const err: ApiError = await api("/api/files").then(
    () => { throw new Error("should reject"); },
    (e: ApiError) => e,
  );
  expect(err.code).toBe("RATE_LIMITED");
  expect(err.message).toBe("操作过于频繁，请稍后再试");
});

test("friendlyMessage：映射码用文案，未知码保留原文，非 Error 兜底", () => {
  expect(friendlyMessage(new ApiError(404, "NOT_FOUND", "not found"))).toBe("文件不存在或已被删除");
  expect(friendlyMessage(new ApiError(409, "CONFLICT", "名称已存在"))).toBe("名称已存在");
  expect(friendlyMessage(new DOMException("x", "AbortError"))).toBe("已取消");
  expect(friendlyMessage(new Error("任意错误"))).toBe("任意错误");
  expect(friendlyMessage("字符串")).toBe("操作失败，请重试");
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

test("401 throws ApiError without navigating (landing page decides)", async () => {
  const loc = { href: "" };
  Object.defineProperty(window, "location", { value: loc, configurable: true });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
  await expect(api("/api/files")).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  expect(loc.href).toBe("");
});

test("401 on public share endpoint throws SHARE_PASSWORD", async () => {
  const loc = { href: "" };
  Object.defineProperty(window, "location", { value: loc, configurable: true });
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ error: { code: "SHARE_PASSWORD", message: "需要提取码" } }), { status: 401 }),
  ));
  const err: ApiError = await api("/api/s/tok").then(() => { throw new Error("should reject"); }, (e: ApiError) => e);
  expect(err.code).toBe("SHARE_PASSWORD");
  expect(loc.href).toBe("");
});

test("handleSessionExpired: no flag → stays (false)", () => {
  const loc = { href: "" };
  Object.defineProperty(window, "location", { value: loc, configurable: true });
  expect(handleSessionExpired()).toBe(false);
  expect(loc.href).toBe("");
});

test("handleSessionExpired: marked session → one-shot redirect", () => {
  const loc = { href: "" };
  Object.defineProperty(window, "location", { value: loc, configurable: true });
  markSessionActive();
  expect(handleSessionExpired()).toBe(true);
  expect(loc.href).toBe("/auth/login");
  // 一次性守卫：同轮生命周期内重复调用不再触发
  const loc2 = { href: "" };
  Object.defineProperty(window, "location", { value: loc2, configurable: true });
  expect(handleSessionExpired()).toBe(true);
  expect(loc2.href).toBe("");
  clearSessionFlag();
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

test("skipActAs omits x-act-as header (global admin ops)", async () => {
  localStorage.setItem("mstor_act_as", "u-123");
  const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await api("/api/me/admin/users", { skipActAs: true });
  const headers = fetchMock.mock.calls[0]![1]!.headers as Headers;
  expect(headers.get("x-act-as")).toBeNull();
  localStorage.removeItem("mstor_act_as");
});
