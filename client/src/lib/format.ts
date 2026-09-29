export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 || v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatDate(ts: number): string {
  // 精确到秒（24 小时制），文件列表/回收站/详情等处保持一致
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** 长文件名中间省略：保留头部与扩展名，如「很长的文件…名.zip」 */
export function truncateMiddle(name: string, max = 36): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && dot < name.length - 1 ? name.slice(dot) : "";
  const stem = ext ? name.slice(0, dot) : name;
  const budget = max - 1 - ext.length; // 1 = 省略号
  const head = Math.ceil(budget * 0.6);
  const tail = Math.floor(budget * 0.4);
  return `${stem.slice(0, head)}…${tail > 0 ? stem.slice(-tail) : ""}${ext}`;
}
