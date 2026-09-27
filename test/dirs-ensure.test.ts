import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, sessionHeaders } from "./helpers";

const json = { "content-type": "application/json" };

async function ensure(u: Awaited<ReturnType<typeof seedUser>>, parentId: string, name: string) {
  return SELF.fetch("https://example.com/api/dirs/ensure", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ parentId, name }),
  });
}

test("ensure creates then reuses the same directory (idempotent)", async () => {
  const u = await seedUser();
  const first = await ensure(u, "", "photos");
  expect(first.status).toBe(201);
  const created = (await first.json()) as { id: string; is_dir: number };

  const second = await ensure(u, "", "photos");
  expect(second.status).toBe(200);
  const reused = (await second.json()) as { id: string };
  expect(reused.id).toBe(created.id);
  expect(created.is_dir).toBe(1);

  // 不同用户同名互不影响
  const u2 = await seedUser();
  const other = await ensure(u2, "", "photos");
  expect(other.status).toBe(201);
  expect(((await other.json()) as { id: string }).id).not.toBe(created.id);
});

test("ensure nests under an existing parent", async () => {
  const u = await seedUser();
  const parent = (await (await ensure(u, "", "photos")).json()) as { id: string };
  const child = (await (await ensure(u, parent.id, "2024")).json()) as { id: string };
  expect(child.id).toBeTruthy();
  const again = (await (await ensure(u, parent.id, "2024")).json()) as { id: string };
  expect(again.id).toBe(child.id);
});

test("ensure avoids UNIQUE clash with a trashed same-name dir", async () => {
  const u = await seedUser();
  const dir = (await (await ensure(u, "", "d")).json()) as { id: string };
  // 删除进回收站后原名列被软删行占用
  await SELF.fetch(`https://example.com/api/files/${dir.id}`, { method: "DELETE", headers: await sessionHeaders(u) });
  const res = await ensure(u, "", "d");
  expect(res.status).toBe(201);
  const created = (await res.json()) as { id: string; name: string };
  expect(created.id).not.toBe(dir.id);
  expect(created.name).toBe("d (2)");
});

test("ensure validates parent and name", async () => {
  const u = await seedUser();
  expect((await ensure(u, "no-such-id", "x")).status).toBe(404);
  expect((await ensure(u, "", "")).status).toBe(400);
  expect((await ensure(u, "", "a/b")).status).toBe(400);
});
