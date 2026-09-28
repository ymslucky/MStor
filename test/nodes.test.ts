import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import {
  assertQuota, breadcrumb, createDir, ensureRootDir, getNode, listChildren,
  moveNode, subtreeIds, uniqueName, usedBytes,
} from "../server/lib/nodes";
import { seedNode, seedUser } from "./helpers";

test("ensureRootDir creates once and reuses", async () => {
  const u = await seedUser();
  const r1 = await ensureRootDir(env.DB, u.id);
  const r2 = await ensureRootDir(env.DB, u.id);
  expect(r1.id).toBe(r2.id);
  expect(r1.parent_id).toBe("");
});

test("createDir + listChildren + breadcrumb", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const photos = await createDir(env.DB, u.id, root.id, "相册");
  const y2024 = await createDir(env.DB, u.id, photos.id, "2024");
  expect((await listChildren(env.DB, u.id, root.id)).map((n) => n.name)).toEqual(["相册"]);
  const crumbs = await breadcrumb(env.DB, u.id, y2024.id);
  expect(crumbs.map((n) => n.name)).toEqual(["相册", "2024"]);
});

test("duplicate name in same dir throws conflict", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  await createDir(env.DB, u.id, root.id, "a");
  await expect(createDir(env.DB, u.id, root.id, "a")).rejects.toThrow(/名称已存在/);
});

test("uniqueName appends (2)", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  await seedNode({ owner_id: u.id, parent_id: root.id, name: "a.txt" });
  expect(await uniqueName(env.DB, u.id, root.id, "a.txt")).toBe("a (2).txt");
  await seedNode({ owner_id: u.id, parent_id: root.id, name: "a (2).txt" });
  expect(await uniqueName(env.DB, u.id, root.id, "a.txt")).toBe("a (3).txt");
});

test("moveNode rejects moving dir into its own descendant", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const dir = await createDir(env.DB, u.id, root.id, "dir");
  const child = await createDir(env.DB, u.id, dir.id, "child");
  await expect(moveNode(env.DB, u.id, dir.id, child.id, "dir")).rejects.toThrow(/不能移动/);
});

test("quota check reads users.used_bytes column", async () => {
  const u = await seedUser({ quota_bytes: 100 });
  await env.DB.prepare("UPDATE users SET used_bytes = 60 WHERE id = ?1").bind(u.id).run();
  await expect(assertQuota(env.DB, u.id, 50)).rejects.toThrow(/配额/);
  await assertQuota(env.DB, u.id, 40);
  expect(await usedBytes(env.DB, u.id)).toBe(60);
});

test("subtreeIds returns self and descendants", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const dir = await createDir(env.DB, u.id, root.id, "d");
  const file = await seedNode({ owner_id: u.id, parent_id: dir.id, name: "f" });
  const ids = await subtreeIds(env.DB, u.id, dir.id);
  expect(ids.sort()).toEqual([dir.id, file.id].sort());
  expect(await getNode(env.DB, u.id, file.id)).not.toBeNull();
});

test("cross-user isolation", async () => {
  const u1 = await seedUser();
  const u2 = await seedUser();
  const u1root = await ensureRootDir(env.DB, u1.id);
  const u1dir = await createDir(env.DB, u1.id, u1root.id, "u1dir");
  const u2root = await ensureRootDir(env.DB, u2.id);
  await createDir(env.DB, u2.id, u2root.id, "u2dir");
  expect(await getNode(env.DB, u2.id, u1dir.id)).toBeNull();
  expect(await listChildren(env.DB, u2.id, u1dir.id)).toEqual([]);
  await expect(moveNode(env.DB, u2.id, u1dir.id, u2root.id, "x")).rejects.toThrow(/资源不存在/);
  expect(await subtreeIds(env.DB, u2.id, u1dir.id)).toEqual([]);
  expect(await breadcrumb(env.DB, u2.id, u1dir.id)).toEqual([]);
});
