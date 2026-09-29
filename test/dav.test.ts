import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { seedUser, davHeaders, sessionHeaders } from "./helpers";

async function upload(u: Awaited<ReturnType<typeof seedUser>>, name: string, body: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT", headers: await sessionHeaders(u), body,
  });
  return ((await res.json()) as { id: string }).id;
}

test("OPTIONS advertises DAV class 1,2", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/dav/", {
    method: "OPTIONS", headers: await davHeaders(u),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("dav")).toContain("1, 2");
});

test("dav requires valid basic auth", async () => {
  const res = await SELF.fetch("https://example.com/dav/", { method: "OPTIONS" });
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")).toContain("Basic");
});

test("disabled user is rejected by dav auth with 401", async () => {
  const u = await seedUser();
  const h = await davHeaders(u);
  await env.DB.prepare("UPDATE users SET disabled_at = ?1 WHERE id = ?2").bind(Date.now(), u.id).run();
  const res = await SELF.fetch("https://example.com/dav/", {
    method: "PROPFIND", headers: { ...h, depth: "1" },
  });
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")).toContain("Basic");
});

test("PROPFIND depth 1 lists root children", async () => {
  const u = await seedUser();
  await upload(u, "dav.txt", "hello");
  const res = await SELF.fetch("https://example.com/dav/", {
    method: "PROPFIND",
    headers: { ...(await davHeaders(u)), depth: "1" },
  });
  expect(res.status).toBe(207);
  const xml = await res.text();
  expect(xml).toContain("<D:multistatus");
  expect(xml).toContain("dav.txt");
  expect(xml).toContain("<D:getcontentlength>5</D:getcontentlength>");
});

test("GET file with range via dav", async () => {
  const u = await seedUser();
  await upload(u, "dav.txt", "hello");
  const res = await SELF.fetch("https://example.com/dav/dav.txt", {
    headers: { ...(await davHeaders(u)), range: "bytes=1-3" },
  });
  expect(res.status).toBe(206);
  expect(await res.text()).toBe("ell");
});

test("PUT creates and replaces file", async () => {
  const u = await seedUser();
  const h = await davHeaders(u);
  expect((await SELF.fetch("https://example.com/dav/new.txt", { method: "PUT", headers: h, body: "v1" })).status).toBe(201);
  expect((await SELF.fetch("https://example.com/dav/new.txt", { method: "PUT", headers: h, body: "v2-longer" })).status).toBe(204);
  const list = (await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json()) as { nodes: { name: string; size: number | null }[] };
  expect(list.nodes[0].name).toBe("new.txt");
  expect(list.nodes[0].size).toBe(9);
});

test("PUT into missing directory returns 409", async () => {
  const u = await seedUser();
  const res = await SELF.fetch("https://example.com/dav/no-dir/x.txt", {
    method: "PUT", headers: await davHeaders(u), body: "x",
  });
  expect(res.status).toBe(409);
});

test("trashed node is invisible to dav and its name is free for PUT", async () => {
  const u = await seedUser();
  const id = await upload(u, "gone.txt", "bye");
  await SELF.fetch(`https://example.com/api/files/${id}`, { method: "DELETE", headers: await sessionHeaders(u) });
  const h = await davHeaders(u);
  const pf = await SELF.fetch("https://example.com/dav/", { method: "PROPFIND", headers: { ...h, depth: "1" } });
  expect(await pf.text()).not.toContain("gone.txt");
  expect((await SELF.fetch("https://example.com/dav/gone.txt", { headers: h })).status).toBe(404);
  // 回收站不占名：DAV PUT 可直接重建同名文件
  expect((await SELF.fetch("https://example.com/dav/gone.txt", { method: "PUT", headers: h, body: "x" })).status).toBe(201);
});

test("dav PUT enforces quota", async () => {
  const u = await seedUser({ quota_bytes: 3 });
  const res = await SELF.fetch("https://example.com/dav/big.txt", {
    method: "PUT", headers: await davHeaders(u), body: "12345",
  });
  expect(res.status).toBe(403);
});

test("nested PUT lands under the subdir; subdir PROPFIND hrefs carry the prefix", async () => {
  const u = await seedUser();
  await SELF.fetch("https://example.com/api/dirs", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ parentId: "", name: "docs" }),
  });
  const h = await davHeaders(u);
  expect((await SELF.fetch("https://example.com/dav/docs/nested.txt", { method: "PUT", headers: h, body: "deep" })).status).toBe(201);
  const pf = await SELF.fetch("https://example.com/dav/docs", { method: "PROPFIND", headers: { ...h, depth: "1" } });
  expect(pf.status).toBe(207);
  const xml = await pf.text();
  expect(xml).toContain("<D:href>/dav/docs</D:href>");
  expect(xml).toContain("<D:href>/dav/docs/nested.txt</D:href>");
});

test("invalid node name and malformed percent-encoding are 400", async () => {
  const u = await seedUser();
  const h = await davHeaders(u);
  // 控制字符名：API 侧 validateNodeName 同款拒绝
  expect((await SELF.fetch("https://example.com/dav/bad%07name.txt", { method: "PUT", headers: h, body: "x" })).status).toBe(400);
  // 畸形百分号序列：URIError 应映射 400 而非 500
  expect((await SELF.fetch("https://example.com/dav/%zz.txt", { method: "PUT", headers: h, body: "x" })).status).toBe(400);
});

// --- Task 16: WebDAV B（MKCOL / MOVE / COPY / DELETE / LOCK）---

async function mkcol(u: Awaited<ReturnType<typeof seedUser>>, path: string) {
  return SELF.fetch(`https://example.com/dav${path}`, { method: "MKCOL", headers: await davHeaders(u) });
}

test("MKCOL creates directory visible via API", async () => {
  const u = await seedUser();
  expect((await mkcol(u, "/photos")).status).toBe(201);
  const list = (await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json()) as { nodes: { name: string }[] };
  expect(list.nodes.map((n) => n.name)).toContain("photos");
  expect((await mkcol(u, "/photos")).status).toBe(405);
});

test("MOVE renames file", async () => {
  const u = await seedUser();
  await upload(u, "old.txt", "x");
  const res = await SELF.fetch("https://example.com/dav/old.txt", {
    method: "MOVE",
    headers: { ...(await davHeaders(u)), destination: "https://example.com/dav/new.txt" },
  });
  expect(res.status).toBe(201);
  const list = (await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json()) as { nodes: { name: string }[] };
  expect(list.nodes[0].name).toBe("new.txt");
});

test("COPY duplicates file (independent R2 object)", async () => {
  const u = await seedUser();
  await upload(u, "src.txt", "copy-me");
  const res = await SELF.fetch("https://example.com/dav/src.txt", {
    method: "COPY",
    headers: { ...(await davHeaders(u)), destination: "https://example.com/dav/dst.txt" },
  });
  expect(res.status).toBe(201);
  const list = (await (await SELF.fetch("https://example.com/api/files", { headers: await sessionHeaders(u) })).json()) as { nodes: { name: string; id: string }[] };
  expect(list.nodes.map((n) => n.name).sort()).toEqual(["dst.txt", "src.txt"]);
  // id 随机必然不同，真正要验证的是 R2 对象独立（新 r2_key）
  const rows = await env.DB.prepare("SELECT name, r2_key FROM nodes WHERE owner_id = ?1 AND is_dir = 0 AND deleted_at IS NULL")
    .bind(u.id).all<{ name: string; r2_key: string }>();
  const keys = Object.fromEntries(rows.results.map((r) => [r.name, r.r2_key]));
  expect(keys["dst.txt"]).not.toBe(keys["src.txt"]);
});

test("MOVE into own subtree is 409 without destroying the target", async () => {
  const u = await seedUser();
  const dir = (await (await SELF.fetch("https://example.com/api/dirs", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ parentId: "", name: "a" }),
  })).json()) as { id: string };
  const fid = await upload(u, "b.txt", "precious");
  await SELF.fetch(`https://example.com/api/files/${fid}`, {
    method: "PATCH",
    headers: { ...(await sessionHeaders(u)), "content-type": "application/json" },
    body: JSON.stringify({ parentId: dir.id }),
  });
  // MOVE /a → /a/b：目标在源子树内，必须先拒绝；否则 existing(b) 被永久删除后才报错
  const res = await SELF.fetch("https://example.com/dav/a", {
    method: "MOVE",
    headers: { ...(await davHeaders(u)), destination: "https://example.com/dav/a/b" },
  });
  expect(res.status).toBe(409);
  expect(await env.DB.prepare("SELECT * FROM nodes WHERE id = ?1").bind(fid).first()).not.toBeNull();
});

test("DELETE via dav permanently removes", async () => {
  const u = await seedUser();
  const fid = await upload(u, "gone.txt", "bye");
  expect((await SELF.fetch("https://example.com/dav/gone.txt", {
    method: "DELETE", headers: await davHeaders(u),
  })).status).toBe(204);
  expect(await env.DB.prepare("SELECT * FROM nodes WHERE id = ?1").bind(fid).first()).toBeNull();
});

test("LOCK returns token", async () => {
  const u = await seedUser();
  await upload(u, "l.txt", "x");
  const res = await SELF.fetch("https://example.com/dav/l.txt", {
    method: "LOCK", headers: await davHeaders(u),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("lock-token")).toContain("opaquelocktoken:");
  expect(await res.text()).toContain("lockdiscovery");
});

test("root sentinel cannot be DELETEd, MOVEd or COPYd", async () => {
  const u = await seedUser();
  const h = await davHeaders(u);
  const dest = { destination: "https://example.com/dav/t" };
  expect((await SELF.fetch("https://example.com/dav/", { method: "DELETE", headers: h })).status).toBe(404);
  expect((await SELF.fetch("https://example.com/dav/", { method: "MOVE", headers: { ...h, ...dest } })).status).toBe(404);
  expect((await SELF.fetch("https://example.com/dav/", { method: "COPY", headers: { ...h, ...dest } })).status).toBe(404);
});

test("MKCOL nests under existing dir; file as parent is 409", async () => {
  const u = await seedUser();
  await upload(u, "f.txt", "x");
  expect((await mkcol(u, "/dir")).status).toBe(201);
  expect((await mkcol(u, "/dir/sub")).status).toBe(201);
  expect((await mkcol(u, "/f.txt/x")).status).toBe(409);
});

test("MOVE without destination is 400; MOVE onto itself is 403", async () => {
  const u = await seedUser();
  await upload(u, "a.txt", "x");
  const h = await davHeaders(u);
  expect((await SELF.fetch("https://example.com/dav/a.txt", { method: "MOVE", headers: h })).status).toBe(400);
  expect((await SELF.fetch("https://example.com/dav/a.txt", {
    method: "MOVE", headers: { ...h, destination: "https://example.com/dav/a.txt" },
  })).status).toBe(403);
});

test("DELETE under a file path is 404 and keeps the file", async () => {
  const u = await seedUser();
  const fid = await upload(u, "f.txt", "x");
  expect((await SELF.fetch("https://example.com/dav/f.txt/child", {
    method: "DELETE", headers: await davHeaders(u),
  })).status).toBe(404);
  expect(await env.DB.prepare("SELECT * FROM nodes WHERE id = ?1").bind(fid).first()).not.toBeNull();
});
