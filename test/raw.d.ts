// Vite `?raw` 导入的静态资源统一声明（仅测试环境使用）
declare module "*.sql?raw" {
  const content: string;
  export default content;
}