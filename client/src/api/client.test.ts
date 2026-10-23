import { afterEach, expect, test, vi } from "vitest";
import { ApiError, api, clearSessionFlag, friendlyMessage, handleSessionExpired, markSessionActive } from "./client";
import { STORAGE_KEYS, removeItem, setString } from "../lib/storage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSessionFlag();
});

test("act-as 时不带浏览器残留的 x-workspace", async () => {
  setString(STORAGE_KEYS.actAs, "target-user");
  setString(STORAGE_KEYS.workspace, "admin-workspace");
  let sent: Headers | null = null;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    sent = new Headers(init?.headers);
    return new Response("{}", { status: 200 });
  }));
  await api("/api/files");
  expect(sent!.get("x-act-as")).toBe("target-user");
  expect(sent!.get("x-workspace")).toBeNull();
  removeItem(STORAGE_KEYS.actAs);
  removeItem(STORAGE_KEYS.workspace);
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
  // fetch 断网抛 TypeError("Failed to fetch")：展示中文网络文案而不是英文原文
  expect(friendlyMessage(new TypeError("Failed to fetch"))).toBe("网络连接异常，请检查网络后重试");
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

// 位置桩：捕获续期导航（handleSessionExpired 经 /auth/renew 实现）
function stubLocation(): { assigned: string[] } {
  const assigned: string[] = [];
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      replace: (url: string) => assigned.push(url),
      assign: (url: string) => assigned.push(url),
      pathname: "/browse",
      search: "",
      get href() {
        return "https://app.test/browse";
      },
      set href(v: string) {
        assigned.push(v);
      },
    },
  });
  return { assigned };
}

test("401 throws ApiError without navigating (hint page decides)", async () => {
  const { assigned } = stubLocation();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
  await expect(api("/api/files")).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  expect(assigned).toEqual([]);
});

test("401 on public share endpoint throws SHARE_PASSWORD", async () => {
  const { assigned } = stubLocation();
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ error: { code: "SHARE_PASSWORD", message: "需要提取码" } }), { status: 401 }),
  ));
  const err: ApiError = await api("/api/s/tok").then(() => { throw new Error("should reject"); }, (e: ApiError) => e);
  expect(err.code).toBe("SHARE_PASSWORD");
  expect(assigned).toEqual([]);
});

test("handleSessionExpired: no flag → stays (false)", () => {
  const { assigned } = stubLocation();
  expect(handleSessionExpired()).toBe(false);
  expect(assigned).toEqual([]);
});

test("handleSessionExpired: marked session → 定向 /auth/renew 续期", () => {
  const { assigned } = stubLocation();
  markSessionActive();
  expect(handleSessionExpired()).toBe(true);
  // 不能原地刷新：SW 导航回退会缓存返回同 URL（到不了边缘 → 打转空白页）
  expect(assigned).toEqual(["/auth/renew?next=%2Fbrowse"]);
  // 一次性守卫：同轮生命周期内重复调用不再触发
  expect(handleSessionExpired()).toBe(true);
  expect(assigned).toHaveLength(1);
  clearSessionFlag();
});

test("handleSessionExpired: 续期后短时间内仍 401 不再跳转（跨刷新防死循环）", async () => {
  const { assigned } = stubLocation();
  markSessionActive();
  sessionStorage.setItem("mstor_renew_at", String(Date.now()));
  vi.resetModules(); // 模拟整页刷新：内存守卫重置，仅剩时间守卫
  const fresh = await import("./client");
  expect(fresh.handleSessionExpired()).toBe(false);
  expect(assigned).toEqual([]);
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
