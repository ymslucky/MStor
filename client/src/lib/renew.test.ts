import { expect, test } from "vitest";
import { RENEW_PATH, nextTarget } from "./renew";

test("nextTarget：同源应用内路径原样回跳", () => {
  expect(nextTarget("/shares?tab=1#x")).toBe("/shares?tab=1#x");
  expect(nextTarget("/trash")).toBe("/trash");
});

test("nextTarget：缺省/外部/协议相对/授权回调/自回环一律回首页", () => {
  expect(nextTarget(null)).toBe("/");
  expect(nextTarget("")).toBe("/");
  expect(nextTarget("https://evil.example/")).toBe("/");
  expect(nextTarget("//evil.example/")).toBe("/");
  expect(nextTarget("/cdn-cgi/access/authorized?state=x")).toBe("/");
  expect(nextTarget(`${RENEW_PATH}?next=/`)).toBe("/");
});
