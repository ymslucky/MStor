import { env, fetchMock, SELF } from "cloudflare:test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { seedUser } from "./helpers";

const ISSUER = "https://auth.msxor.com";

function b64urlJson(obj: object): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function idToken(claims: object): string {
  return `${b64urlJson({ alg: "RS256", typ: "JWT" })}.${b64urlJson(claims)}.sig`;
}

// fetchMock 为 undici MockAgent：get(origin).intercept({ method, path }).reply(...)
function mockDiscovery() {
  fetchMock.get(ISSUER).intercept({
    method: "GET",
    path: "/.well-known/openid-configuration",
  }).reply(200, JSON.stringify({
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
  }), { headers: { "content-type": "application/json" } });
}

function mockToken(id_token: string) {
  fetchMock.get(ISSUER).intercept({
    method: "POST",
    path: "/token",
  }).reply(200, JSON.stringify({ id_token }), { headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.deactivate());

test("login redirects to IdP with PKCE and state cookie", async () => {
  mockDiscovery();
  const res = await SELF.fetch("https://example.com/auth/login", { redirect: "manual" });
  expect(res.status).toBe(302);
  const loc = new URL(res.headers.get("location")!);
  expect(loc.origin).toBe(ISSUER);
  expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
  expect(res.headers.get("set-cookie")).toContain("mstor_oidc=");
});

test("callback upserts user (first is admin), creates root, sets session", async () => {
  mockDiscovery();
  mockToken(idToken({ sub: "s1", name: "Alice" }));
  const state = "st123";
  const res = await SELF.fetch(`https://example.com/auth/callback?code=c1&state=${state}`, {
    redirect: "manual",
    headers: { cookie: `mstor_oidc=${encodeURIComponent(JSON.stringify({ state, verifier: "v" }))}` },
  });
  expect(res.status).toBe(302);
  expect(res.headers.get("set-cookie")).toContain("mstor_session=");
  const user = await env.DB.prepare("SELECT * FROM users WHERE oidc_sub = 's1'").first<{ id: string; role: string }>();
  expect(user!.role).toBe("admin"); // 首个用户
  const root = await env.DB.prepare("SELECT * FROM nodes WHERE owner_id = ?1 AND parent_id = ''").bind(user!.id).first();
  expect(root).toBeTruthy();
});

test("second user defaults to member", async () => {
  await seedUser({ oidc_sub: "existing" }); // 占住"首个用户"
  mockDiscovery();
  mockToken(idToken({ sub: "s2", name: "Bob" }));
  const res = await SELF.fetch("https://example.com/auth/callback?code=c&state=x", {
    redirect: "manual",
    headers: { cookie: `mstor_oidc=${encodeURIComponent(JSON.stringify({ state: "x", verifier: "v" }))}` },
  });
  expect(res.status).toBe(302);
  const user = await env.DB.prepare("SELECT * FROM users WHERE oidc_sub = 's2'").first<{ role: string }>();
  expect(user!.role).toBe("member");
});

test("callback returns 401 when token endpoint fails", async () => {
  mockDiscovery();
  fetchMock.get(ISSUER).intercept({
    method: "POST",
    path: "/token",
  }).reply(500, "boom");
  const res = await SELF.fetch("https://example.com/auth/callback?code=c&state=x", {
    redirect: "manual",
    headers: { cookie: `mstor_oidc=${encodeURIComponent(JSON.stringify({ state: "x", verifier: "v" }))}` },
  });
  expect(res.status).toBe(401);
});

test("callback with wrong state is rejected", async () => {
  mockDiscovery();
  const res = await SELF.fetch("https://example.com/auth/callback?code=c&state=bad", {
    redirect: "manual",
    headers: { cookie: `mstor_oidc=${encodeURIComponent(JSON.stringify({ state: "good", verifier: "v" }))}` },
  });
  expect(res.status).toBe(401);
});
