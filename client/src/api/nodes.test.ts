import { afterEach, expect, test, vi } from "vitest";
import { contentUrl, deleteNodePermanently } from "./nodes";
import { STORAGE_KEYS, removeItem, setString } from "../lib/storage";

afterEach(() => {
  vi.unstubAllGlobals();
  removeItem(STORAGE_KEYS.actAs);
});

test("contentUrl 在 act-as 时带 act_as 查询参数", () => {
  expect(contentUrl("f1")).toBe("/api/files/f1/content");
  setString(STORAGE_KEYS.actAs, "target id");
  expect(contentUrl("f1", true)).toBe("/api/files/f1/content?dl=1&act_as=target+id");
});

function okRes(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

test("deleteNodePermanently 软删后再彻底删除（顺序两连调）", async () => {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method} ${url}`);
    return okRes();
  });
  vi.stubGlobal("fetch", fetchMock);
  await deleteNodePermanently("n1");
  expect(calls).toEqual(["DELETE /api/files/n1", "DELETE /api/trash/n1"]);
});

test("软删失败时不发起 purge", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: "BAD_REQUEST", message: "x" } }), { status: 400 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(deleteNodePermanently("n1")).rejects.toThrow("x");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
