import { SELF, env } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedNode, seedUser, sessionHeaders } from "./helpers";

test("search by name prefix with owner isolation and trash exclusion", async () => {
  const u = await seedUser();
  const other = await seedUser();
  await seedNode({ owner_id: u.id, name: "财报2024.pdf", size: 1 });
  await seedNode({ owner_id: u.id, name: "财报草稿.pdf", deleted_at: Date.now() });
  await seedNode({ owner_id: other.id, name: "财报2024.pdf", size: 1 });

  const res = await SELF.fetch(`https://example.com/api/search?q=${encodeURIComponent("财报")}`, {
    headers: await sessionHeaders(u),
  });
  expect(res.status).toBe(200);
  const { nodes } = (await res.json()) as { nodes: { name: string }[] };
  expect(nodes).toHaveLength(1);
  expect(nodes[0].name).toBe("财报2024.pdf");
});

test("fts match on substring of long query", async () => {
  const u = await seedUser();
  await seedNode({ owner_id: u.id, name: "财报2024.pdf" });
  await seedNode({ owner_id: u.id, name: "会议纪要.docx" });

  // ≥3 码点走 FTS5 trigram MATCH 分支
  const res = await SELF.fetch(`https://example.com/api/search?q=${encodeURIComponent("报2024")}`, {
    headers: await sessionHeaders(u),
  });
  expect(res.status).toBe(200);
  const { nodes } = (await res.json()) as { nodes: { name: string }[] };
  expect(nodes).toHaveLength(1);
  expect(nodes[0].name).toBe("财报2024.pdf");
});

test("empty query returns empty list", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/api/search?q=", { headers: await sessionHeaders(u) });
  expect(((await res.json()) as { nodes: unknown[] }).nodes).toHaveLength(0);
});

test("search returns breadcrumb paths", async () => {
  const user = await seedUser();
  const dirA = await seedNode({ owner_id: user.id, name: "相册", is_dir: 1 });
  const dirB = await seedNode({ owner_id: user.id, parent_id: dirA.id, name: "2026", is_dir: 1 });
  const nested = await seedNode({ owner_id: user.id, parent_id: dirB.id, name: "聚会.jpg" });
  const top = await seedNode({ owner_id: user.id, name: "随笔.txt" });
  // q='.' 同时命中聚会.jpg 与 随笔.txt（原计划 q=聚 命中不到顶层文件，断言不可达）
  const res = await SELF.fetch("https://example.com/api/search?q=.", { headers: await sessionHeaders(user) });
  const data = await res.json<{ paths: Record<string, string> }>();
  expect(data.paths[nested.id]).toBe("相册/2026/聚会.jpg");
  expect(data.paths[top.id]).toBe("随笔.txt");
});

test("fts external content: rename/delete stay in sync without duplicates", async () => {
  const u = await seedUser();
  const f = await seedNode({ owner_id: u.id, name: "报告-v1.pdf", size: 1 });

  // FTS 行 rowid 即 nodes.rowid，INSERT 触发器同步，恰好 1 行
  const ftsCount = async (nid: string) => {
    const r = (await env.DB.prepare("SELECT rowid FROM nodes WHERE id = ?1").bind(nid).first<{ rowid: number }>())!;
    if (!r) return 0; // 行已删除
    return (await env.DB.prepare("SELECT COUNT(*) AS n FROM nodes_fts WHERE rowid = ?1").bind(r.rowid).first<{ n: number }>())!.n;
  };
  expect(await ftsCount(f.id)).toBe(1);

  // 重命名：旧名搜不到、新名搜得到，FTS 仍是 1 行（rowid 复用，不累积重复行）
  await env.DB.prepare("UPDATE nodes SET name = ?1, updated_at = ?2 WHERE id = ?3")
    .bind("报告-v2.pdf", Date.now(), f.id).run();
  expect(await ftsCount(f.id)).toBe(1);

  const res = await SELF.fetch(`https://example.com/api/search?q=${encodeURIComponent("报告-v2")}`, {
    headers: await sessionHeaders(u),
  });
  expect(((await res.json()) as { nodes: { id: string }[] }).nodes.map((n) => n.id)).toContain(f.id);
  const resOld = await SELF.fetch(`https://example.com/api/search?q=${encodeURIComponent("报告-v1")}`, {
    headers: await sessionHeaders(u),
  });
  expect(((await resOld.json()) as { nodes: { id: string }[] }).nodes).toHaveLength(0);

  // 彻底删除：FTS 行随之清除
  await env.DB.prepare("DELETE FROM nodes WHERE id = ?1").bind(f.id).run();
  expect(await ftsCount(f.id)).toBe(0);
});
