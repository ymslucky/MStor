import { Clock, FolderOpen, ShieldCheck, Share2, Star, Tag, Trash2, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  /** 仅平台管理员可见 */
  platformOnly?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** 侧栏分区（浏览 / 管理 / 平台）——移动端抽屉与桌面侧栏共用同一份结构 */
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
    title: "平台",
    items: [
      { to: "/platform/users", label: "用户管理", Icon: Users, platformOnly: true },
      { to: "/platform/audit", label: "日志审计", Icon: ShieldCheck, platformOnly: true },
    ],
  },
];

/** 按权限过滤后的分区：非平台管理员看不到「平台」组 */
export function sectionsFor(isPlatformAdmin: boolean): NavSection[] {
  return SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.platformOnly || isPlatformAdmin),
  })).filter((s) => s.items.length > 0);
}

/** 顶栏页名（桌面无顶栏，移动端使用） */
export const PAGE_TITLES: Record<string, string> = {
  "/": "文件",
  "/favorites": "收藏",
  "/recent": "最近",
  "/tags": "标签",
  "/trash": "回收站",
  "/shares": "分享",
  "/settings": "设置",
  "/platform/users": "用户管理",
  "/platform/audit": "日志审计",
  "/design": "设计系统",
};
