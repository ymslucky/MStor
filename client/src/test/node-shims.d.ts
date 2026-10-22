// 客户端测试运行在 Node（Vitest）里：只声明用到的 node 内置模块，避免为测试引入 @types/node
declare module "node:fs" {
  export function readFileSync(path: URL | string, encoding: "utf8"): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
}

declare module "node:path" {
  const path: {
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
    dirname(p: string): string;
    relative(from: string, to: string): string;
  };
  export default path;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
