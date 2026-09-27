import { afterEach, expect, test, vi } from "vitest";
import { deleteNodePermanently } from "./nodes";

afterEach(() => {
  vi.unstubAllGlobals();
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
