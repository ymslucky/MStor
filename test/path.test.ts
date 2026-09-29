import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import {
  breadcrumb, createDir, ensureRootDir, getNode, isDescendant, moveNode, subtreeIds,
} from "../server/lib/nodes";
import { moveMany, restoreTrashNode, softDeleteMany, softDeleteNode } from "../server/routes/trash";
import { seedNode, seedUser } from "./helpers";

/** 递归校验整棵树的 path 与 parent_id 一致 */
async function assertPathConsistent(ownerId: string, nodeId: string) {
  const node = (await getNode(env.DB, ownerId, nodeId))!;
  const hi = `${node.path}${node.id}/g`;
  const { results } = await env.DB.prepare(
    "SELECT id, parent_id, path FROM nodes WHERE owner_id = ?1 AND path >= ?2 AND path < ?3"
  ).bind(ownerId, `${node.path}${node.id}/`, hi).all<{ id: string; parent_id: string; path: string }>();
  expect(results.length).toBeGreaterThan(0);
  for (const row of results) {
    const parent = (await getNode(env.DB, ownerId, row.parent_id))!;
    expect(row.path).toBe(`${parent.path}${parent.id}/`);
  }
}

test("createDir writes materialized path (root child / nested)", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const photos = await createDir(env.DB, u.id, root.id, "相册");
  const y2024 = await createDir(env.DB, u.id, photos.id, "2024");
  expect(photos.path).toBe(`/${root.id}/`);
  expect(photos.parent_id).toBe(root.id); // 顶层节点 parent_id = 根哨兵行 id
  expect(y2024.path).toBe(`/${root.id}/${photos.id}/`);
});

test("breadcrumb built from materialized path", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const a = await createDir(env.DB, u.id, root.id, "a");
  const b = await createDir(env.DB, u.id, a.id, "b");
  const c = await createDir(env.DB, u.id, b.id, "c");
  const crumbs = await breadcrumb(env.DB, u.id, c.id);
  expect(crumbs.map((n) => n.name)).toEqual(["a", "b", "c"]);
  expect(await breadcrumb(env.DB, u.id, root.id)).toEqual([]);
});

test("moveNode shifts whole subtree path in one batch", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const dir = await createDir(env.DB, u.id, root.id, "dir");
  const sub = await createDir(env.DB, u.id, dir.id, "sub");
  const file = await seedNode({ owner_id: u.id, parent_id: sub.id, name: "f.txt", size: 1 });
  const target = await createDir(env.DB, u.id, root.id, "target");

  await moveNode(env.DB, u.id, dir.id, target.id, "dir");
  const movedDir = (await getNode(env.DB, u.id, dir.id))!;
  const movedSub = (await getNode(env.DB, u.id, sub.id))!;
  const movedFile = (await getNode(env.DB, u.id, file.id))!;
  expect(movedDir.path).toBe(`/${root.id}/${target.id}/`);
  expect(movedSub.path).toBe(`/${root.id}/${target.id}/${dir.id}/`);
  expect(movedFile.path).toBe(`/${root.id}/${target.id}/${dir.id}/${sub.id}/`);
  expect(await isDescendant(env.DB, u.id, dir.id, file.id)).toBe(true);
  expect(await isDescendant(env.DB, u.id, dir.id, target.id)).toBe(false);
  // 重命名不改路径
  await moveNode(env.DB, u.id, dir.id, target.id, "renamed");
  expect((await getNode(env.DB, u.id, file.id))!.path).toBe(movedFile.path);
});

test("subtreeIds via path prefix", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const dir = await createDir(env.DB, u.id, root.id, "d");
  const sub = await createDir(env.DB, u.id, dir.id, "s");
  const f = await seedNode({ owner_id: u.id, parent_id: sub.id, name: "f" });
  const ids = await subtreeIds(env.DB, u.id, dir.id);
  expect(ids.sort()).toEqual([dir.id, sub.id, f.id].sort());
});

test("softDeleteMany + restore keep subtree paths consistent", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const dir = await createDir(env.DB, u.id, root.id, "dir");
  const sub = await createDir(env.DB, u.id, dir.id, "sub");
  const file = await seedNode({ owner_id: u.id, parent_id: sub.id, name: "f.txt", size: 10 });

  await softDeleteMany(env.DB, u.id, [dir.id]);
  expect((await getNode(env.DB, u.id, file.id))!.deleted_at).not.toBeNull();
  // 还原：父目录仍在，路径不变
  await restoreTrashNode(env.DB, u.id, dir.id);
  expect((await getNode(env.DB, u.id, file.id))!.deleted_at).toBeNull();
  await assertPathConsistent(u.id, dir.id);
});

test("restore to root when parent deleted recomputes subtree path", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const dir = await createDir(env.DB, u.id, root.id, "dir");
  const sub = await createDir(env.DB, u.id, dir.id, "sub");
  const file = await seedNode({ owner_id: u.id, parent_id: sub.id, name: "f.txt", size: 5 });

  await softDeleteMany(env.DB, u.id, [dir.id, sub.id]);
  await restoreTrashNode(env.DB, u.id, sub.id); // 父 dir 已删 → 还原到根
  const restoredSub = (await getNode(env.DB, u.id, sub.id))!;
  expect(restoredSub.parent_id).toBe(root.id);
  expect(restoredSub.path).toBe(`/${root.id}/`);
  const restoredFile = (await getNode(env.DB, u.id, file.id))!;
  expect(restoredFile.deleted_at).toBeNull();
  expect(restoredFile.path).toBe(`/${root.id}/${sub.id}/`);
  await assertPathConsistent(u.id, sub.id);
});

test("moveMany batch-updates dir subtree paths", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const d1 = await createDir(env.DB, u.id, root.id, "d1");
  const d2 = await createDir(env.DB, u.id, d1.id, "d2");
  const f = await seedNode({ owner_id: u.id, parent_id: d2.id, name: "f.txt", size: 1 });
  const target = await createDir(env.DB, u.id, root.id, "target");

  const moved = await moveMany(env.DB, u.id, [d1.id], target.id);
  expect(moved).toBe(1);
  expect((await getNode(env.DB, u.id, d1.id))!.path).toBe(`/${root.id}/${target.id}/`);
  expect((await getNode(env.DB, u.id, d2.id))!.path).toBe(`/${root.id}/${target.id}/${d1.id}/`);
  expect((await getNode(env.DB, u.id, f.id))!.path).toBe(`/${root.id}/${target.id}/${d1.id}/${d2.id}/`);
});

test("softDeleteNode via path keeps used_bytes and marks subtree", async () => {
  const u = await seedUser();
  const root = await ensureRootDir(env.DB, u.id);
  const dir = await createDir(env.DB, u.id, root.id, "dir");
  const f1 = await seedNode({ owner_id: u.id, parent_id: dir.id, name: "a.txt", size: 100 });
  const f2 = await seedNode({ owner_id: u.id, parent_id: root.id, name: "b.txt", size: 50 });
  await env.DB.prepare("UPDATE users SET used_bytes = 150 WHERE id = ?1").bind(u.id).run();

  await softDeleteNode(env.DB, u.id, dir.id);
  expect((await getNode(env.DB, u.id, f1.id))!.deleted_at).not.toBeNull();
  expect((await getNode(env.DB, u.id, f2.id))!.deleted_at).toBeNull();
  const row = await env.DB.prepare("SELECT used_bytes FROM users WHERE id = ?1").bind(u.id).first<{ used_bytes: number }>();
  expect(row!.used_bytes).toBe(50);
});
