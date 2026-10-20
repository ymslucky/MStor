#!/usr/bin/env node
/**
 * npm 11 起对依赖的 install 脚本有 allowScripts 门禁：未批准的包不会跑 postinstall，
 * 于是 workerd 包只留下 Node 包装脚本（bin/workerd），平台二进制没被复制成 bin/workerd.exe，
 * 表现为 Miniflare 启动即 `std::terminate()` / ERR_RUNTIME_FAILURE。
 *
 * 这里做一件很小的事：缺失时把平台包里的二进制复制过去。失败不阻断（只用警告）。
 * 触发点：predev / pretest:server。
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const platformDirs = {
  win32: { dir: "workerd-windows-64", bin: "workerd.exe" },
  darwin: { dir: "workerd-darwin-64", bin: "workerd" },
  linux: { dir: "workerd-linux-64", bin: "workerd" },
};

function ensureAt(workerdPkgDir) {
  const platform = platformDirs[process.platform];
  if (!platform) return "skip: 未知平台";
  const target = join(workerdPkgDir, "bin", platform.bin);
  if (existsSync(target)) return "ok: 已存在";
  const candidates = [
    join(root, "node_modules", "@cloudflare", platform.dir, "bin", platform.bin),
    join(workerdPkgDir, "..", "..", "@cloudflare", platform.dir, "bin", platform.bin),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) return "skip: 找不到平台二进制（请检查 npm install 是否被 allowScripts 拦下）";
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(found, target);
  return "fixed: 已复制平台二进制";
}

function main() {
  const targets = [];
  const rootWorkerd = join(root, "node_modules", "workerd");
  if (existsSync(rootWorkerd)) targets.push(rootWorkerd);
  const nested = join(root, "node_modules", "@cloudflare", "vitest-pool-workers", "node_modules", "workerd");
  if (existsSync(nested)) targets.push(nested);
  const wranglerNested = join(root, "node_modules", "wrangler", "node_modules", "workerd");
  if (existsSync(wranglerNested)) targets.push(wranglerNested);

  if (targets.length === 0) return;
  for (const dir of targets) {
    const rel = dir.replace(root, "").replace(/^[\\/]/, "");
    const result = ensureAt(dir);
    if (result.startsWith("fixed") || result.startsWith("skip")) {
      console.warn(`[ensure-workerd] ${rel}: ${result}`);
    }
  }
}

main();
