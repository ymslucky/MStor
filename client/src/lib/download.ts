// 下载触发：通过临时 <a> 元素触发浏览器原生下载（content?dl=1 走 Content-Disposition: attachment）
import { contentUrl } from "../api/nodes";

/** 触发单文件下载；批量场景由调用方控制时序间隔 */
export function triggerDownload(id: string): void {
  const a = document.createElement("a");
  a.href = contentUrl(id, true);
  document.body.appendChild(a);
  a.click();
  a.remove();
}