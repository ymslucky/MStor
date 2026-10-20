import { FolderOpen, Settings, Share2, Trash2 } from "lucide-react";

/** 主导航（桌面侧栏与移动底栏共用同一份定义） */
export const NAV = [
  { to: "/", label: "文件", Icon: FolderOpen },
  { to: "/trash", label: "回收站", Icon: Trash2 },
  { to: "/shares", label: "分享", Icon: Share2 },
  { to: "/settings", label: "设置", Icon: Settings },
] as const;

/** 顶栏左侧页名（文件页的面包屑由页内渲染，这里只放页名） */
export const PAGE_TITLES: Record<string, string> = {
  "/": "文件",
  "/trash": "回收站",
  "/shares": "分享",
  "/settings": "设置",
};
