import { contentUrl } from "../api/nodes";
import { BATCH_DOWNLOAD_GAP_MS } from "./constants";

/** 触发单文件下载；批量场景由调用方控制时序间隔 */
export function triggerDownload(id: string): void {
  const a = document.createElement("a");
  a.href = contentUrl(id, true);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * 批量下载：逐个错峰触发（避免浏览器把连续下载判定为弹窗而拦截）。
 * 间隔是跨页面一致的策略，收在这里而不是散落在页面里写 `i * 300`。
 */
export function downloadMany(ids: string[]): void {
  ids.forEach((id, i) => {
    if (i === 0) {
      triggerDownload(id);
      return;
    }
    window.setTimeout(() => triggerDownload(id), i * BATCH_DOWNLOAD_GAP_MS);
  });
}
