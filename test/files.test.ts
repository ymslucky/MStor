import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, sessionHeaders } from "./helpers";

const json = { "content-type": "application/json" };

type ListBody = { nodes: { id: string; name: string }[]; breadcrumb: { name: string }[]; rootId: string };

async function mkDir(user: Awaited<ReturnType<typeof seedUser>>, parentId: string, name: string) {
  return SELF.fetch("https://example.com/api/dirs", {
    method: "POST",
    headers: { ...(await sessionHeaders(user)), ...json },
    body: JSON.stringify({ parentId, name }),
  });
}

test("mkdir + list with breadcrumb", async () => {
  const u = await seedUser();
  const res = await mkDir(u, "", "相册");
  expect(res.status).toBe(201);
  const dir = (await res.json()) as { id: string };
  const list = await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) });
  const body = (await list.json()) as ListBody;
  expect(body.nodes).toHaveLength(1);
  expect(body.nodes[0].name).toBe("相册");
  const sub = await mkDir(u, dir.id, "2024");
  expect(sub.status).toBe(201);
  const list2 = await SELF.fetch(`https://example.com/api/files?parentId=${dir.id}`, {
    headers: await sessionHeaders(u),
  });
  const body2 = (await list2.json()) as ListBody;
  expect(body2.nodes.map((n) => n.name)).toEqual(["2024"]);
  expect(body2.breadcrumb.map((n) => n.name)).toEqual(["相册"]);
});

test("duplicate dir name returns 409", async () => {
  const u = await seedUser();
  await mkDir(u, "", "a");
  const res = await mkDir(u, "", "a");
  expect(res.status).toBe(409);
});

test("rename via PATCH", async () => {
  const u = await seedUser();
  const dir = (await (await mkDir(u, "", "old")).json()) as { id: string };
  const res = await SELF.fetch(`https://example.com/api/files/${dir.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ name: "new" }),
  });
  expect(res.status).toBe(200);
  const list = await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) });
  const body = (await list.json()) as ListBody;
  expect(body.nodes[0].name).toBe("new");
});

test("isolation: user B cannot touch user A's node", async () => {
  const a = await seedUser({ name: "a" });
  const b = await seedUser({ name: "b" });
  const dir = (await (await mkDir(a, "", "secret")).json()) as { id: string };
  const res = await SELF.fetch(`https://example.com/api/files/${dir.id}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(b)), ...json },
    body: JSON.stringify({ name: "hacked" }),
  });
  expect(res.status).toBe(404);
  const listB = await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(b) });
  const bodyB = (await listB.json()) as ListBody;
  expect(bodyB.nodes).toHaveLength(0);
});
