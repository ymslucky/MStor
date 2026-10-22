// 客户端测试运行在 Node（Vitest）里：只声明用到的 node 内置模块，避免为测试引入 @types/node
declare module "node:fs" {
  export function readFileSync(path: URL | string, encoding: "utf8"): string;
}
