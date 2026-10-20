import { Clock, FolderOpen, Settings, Share2, Star, Tag, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** 侧栏分区（浏览 / 共享 / 系统）——移动端抽屉也用同一份结构 */
export const SECTIONS: NavSection[] = [
  {
    title: "浏览",
    items: [
      { to: "/", label: "文件", Icon: FolderOpen },
      { to: "/favorites", label: "收藏", Icon: Star },
      { to: "/recent", label: "最近", Icon: Clock },
      { to: "/tags", label: "标签", Icon: Tag },
    ],
  },
  {
    title: "管理",
    items: [
      { to: "/shares", label: "分享", Icon: Share2 },
      { to: "/trash", label: "回收站", Icon: Trash2 },
    ],
  },
  {
    title: "系统",
    items: [{ to: "/settings", label: "设置", Icon: Settings }],
  },
];

/** 扁平视图（顶栏页名、移动端等只需顺序遍历的场景） */
export const NAV: NavItem[] = SECTIONS.flatMap((s) => s.items);

/** 顶栏左侧页名（文件页的面包屑由页内渲染，这里只放页名） */
export const PAGE_TITLES: Record<string, string> = {
  "/": "文件",
  "/favorites": "收藏",
  "/recent": "最近",
  "/tags": "标签",
  "/trash": "回收站",
  "/shares": "分享",
  "/settings": "设置",
};
