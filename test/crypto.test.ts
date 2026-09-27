import { expect, test } from "vitest";
import { b64, pbkdf2Hash, pbkdf2Verify, randomToken, sha256B64Url, unb64 } from "../server/lib/crypto";

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

test("unb64 decodes base64url with -/_ across padding remainders", () => {
  // b64([0,255,191]) = "AP+/" → url "AP-_"（rem 0，含两种 url 特殊字符）
  expect([...unb64("AP-_")]).toEqual([0, 255, 191]);
  // b64([0,255,191,0,0]) = "AP+/AAA=" → "AP-_AAA"（rem 3）
  expect([...unb64("AP-_AAA")]).toEqual([0, 255, 191, 0, 0]);
  // b64([0,255,191,0]) = "AP+/AA==" → "AP-_AA"（rem 2）
  expect([...unb64("AP-_AA")]).toEqual([0, 255, 191, 0]);
  // 标准 base64 输入仍兼容
  expect([...unb64("AP+/AAA=")]).toEqual([0, 255, 191, 0, 0]);
});

test("unb64 roundtrips base64url encodings", () => {
  const samples = [
    [0, 255, 191],
    [0, 255, 191, 0],
    [0, 255, 191, 0, 0],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [255, 254, 253, 252, 251, 250],
  ];
  for (const s of samples) {
    const bytes = new Uint8Array(s);
    const urlForm = b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect([...unb64(urlForm)]).toEqual([...bytes]);
  }
});
