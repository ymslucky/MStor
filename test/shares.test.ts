import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { randomId } from "../server/lib/crypto";
import { seedNode, seedUser, sessionHeaders } from "./helpers";

const json = { "content-type": "application/json" };

async function upload(u: Awaited<ReturnType<typeof seedUser>>, name: string, body: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/files/upload?name=${name}`, {
    method: "PUT", headers: await sessionHeaders(u), body,
  });
  return ((await res.json()) as { id: string }).id;
}

test("create share → public meta → raw download increments counter", async () => {
  const u = await seedUser();
  const fid = await upload(u, "share.txt", "shared-data");
  const created = await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: fid }),
  });
  expect(created.status).toBe(201);
  const { token } = (await created.json()) as { token: string };

  const meta = await SELF.fetch(`https://example.com/api/s/${token}`);
  expect(meta.status).toBe(200);
  expect(((await meta.json()) as { name: string }).name).toBe("share.txt");

  const raw = await SELF.fetch(`https://example.com/api/s/${token}/raw/${fid}`);
  expect(raw.status).toBe(200);
  expect(await raw.text()).toBe("shared-data");
  const row = await env.DB.prepare("SELECT downloads FROM shares WHERE token = ?1").bind(token).first<{ downloads: number }>();
  expect(row!.downloads).toBe(1);
});

test("password-protected share requires x-share-password", async () => {
  const u = await seedUser();
  const fid = await upload(u, "p.txt", "x");
  const { token } = (await (await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: fid, password: "1234" }),
  })).json()) as { token: string };
  expect((await SELF.fetch(`https://example.com/api/s/${token}`)).status).toBe(401);
  const ok = await SELF.fetch(`https://example.com/api/s/${token}`, { headers: { "x-share-password": "1234" } });
  expect(ok.status).toBe(200);
});

test("expired share returns 410; revoked returns 404", async () => {
  const u = await seedUser();
  const fid = await upload(u, "e.txt", "x");
  const { token } = (await (await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: fid }),
  })).json()) as { token: string };
  const shareId = ((await env.DB.prepare("SELECT id FROM shares WHERE token = ?1").bind(token).first()) as { id: string }).id;
  await env.DB.prepare("UPDATE shares SET expires_at = ?1 WHERE id = ?2").bind(Date.now() - 1000, shareId).run();
  expect((await SELF.fetch(`https://example.com/api/s/${token}`)).status).toBe(410);
  await env.DB.prepare("UPDATE shares SET expires_at = NULL, revoked_at = ?1 WHERE id = ?2").bind(Date.now(), shareId).run();
  expect((await SELF.fetch(`https://example.com/api/s/${token}`)).status).toBe(404);
});

test("raw outside subtree is 404", async () => {
  const u = await seedUser();
  const fid = await upload(u, "in.txt", "x");
  const outsider = await seedNode({ owner_id: u.id, name: "out.txt", size: 1, r2_key: `${u.id}/${randomId()}` });
  const { token } = (await (await SELF.fetch("https://example.com/api/shares", {
    method: "POST",
    headers: { ...(await sessionHeaders(u)), ...json },
    body: JSON.stringify({ nodeId: fid }),
  })).json()) as { token: string };
  expect((await SELF.fetch(`https://example.com/api/s/${token}/raw/${outsider.id}`)).status).toBe(404);
});
