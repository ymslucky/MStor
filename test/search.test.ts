import { SELF } from "cloudflare:test";
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
