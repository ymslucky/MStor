import { expect, test } from "vitest";
import { pbkdf2Hash, pbkdf2Verify, randomToken, sha256B64Url } from "../server/lib/crypto";

test("pbkdf2 hash/verify roundtrip", async () => {
  const stored = await pbkdf2Hash("secret-password");
  expect(stored.startsWith("pbkdf2$")).toBe(true);
  expect(await pbkdf2Verify("secret-password", stored)).toBe(true);
  expect(await pbkdf2Verify("wrong", stored)).toBe(false);
});

test("randomToken is url-safe", () => {
  const t = randomToken(16);
  expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
});

test("sha256B64Url matches known vector", async () => {
  expect(await sha256B64Url("abc")).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
});

test("pbkdf2Verify returns false for tampered/malformed stored hash", async () => {
  const stored = await pbkdf2Hash("secret-password");
  expect(await pbkdf2Verify("secret-password", stored.slice(0, -4) + "AAAA")).toBe(false);
  expect(await pbkdf2Verify("secret-password", stored.split("$")[0])).toBe(false);
  expect(await pbkdf2Verify("secret-password", "not-a-hash")).toBe(false);
});

test("pbkdf2 roundtrip with unicode password", async () => {
  const stored = await pbkdf2Hash("密码🔐123");
  expect(await pbkdf2Verify("密码🔐123", stored)).toBe(true);
  expect(await pbkdf2Verify("密码", stored)).toBe(false);
});
