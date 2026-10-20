// wrangler.jsonc 的 assets.directory 指向 ./client/dist；该目录是构建产物（已不入库），
// 但 vitest-pool-workers 会按 configPath 加载 wrangler 配置并要求目录存在，
// 因此在跑服务端测试前先确保它存在（只补一个占位 index.html，真实构建会覆盖）。
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const dir = "client/dist";
const index = `${dir}/index.html`;

if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
if (!existsSync(index)) {
  writeFileSync(index, "<!doctype html><meta charset=\"utf-8\"><title>placeholder</title>\n");
  console.log("ensure-dist: created placeholder client/dist/index.html");
} else {
  console.log("ensure-dist: client/dist already present");
}
