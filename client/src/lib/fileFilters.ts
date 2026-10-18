// 目录内前端过滤（类型/时间）：纯前端过滤当前列表，不新增后端调用
import type { Node } from "../api/types";

export type TypeFilter = "all" | "image" | "video" | "doc";
export type TimeFilter = "all" | "today" | "7d" | "30d";

export const TYPE_CHIPS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "doc", label: "文档" },
];

// 时间组无「全部」项：点击已选 chip 再次取消
export const TIME_CHIPS: { value: TimeFilter; label: string }[] = [
  { value: "today", label: "今天" },
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
];

export function matchType(n: Node, f: TypeFilter): boolean {
  if (f === "all") return true;
  if (n.is_dir) return false;
  const mime = n.mime ?? "";
  if (f === "image") return mime.startsWith("image/");
  if (f === "video") return mime.startsWith("video/");
  return (
    mime.startsWith("text/") ||
    mime.startsWith("application/pdf") ||
    mime.startsWith("application/json") ||
    mime.startsWith("application/msword") ||
    mime.startsWith("application/rtf") ||
    mime.includes("officedocument") ||
    mime.includes("spreadsheet") ||
    mime.includes("presentation")
  );
}

export function matchTime(n: Node, f: TimeFilter): boolean {
  if (f === "all") return true;
  if (f === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return n.updated_at >= d.getTime();
  }
  return n.updated_at >= Date.now() - (f === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;
}

/** 类型 + 时间组合过滤 */
export function filterNodes(nodes: Node[], type: TypeFilter, time: TimeFilter): Node[] {
  if (type === "all" && time === "all") return nodes;
  return nodes.filter((n) => matchType(n, type) && matchTime(n, time));
}