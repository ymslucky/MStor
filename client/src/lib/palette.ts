import { Clock, FilePlus2, Star, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Node } from "../api/types";

/** 命令面板的一条结果：文件/目录项或静态操作 */
export interface PaletteItem {
  key: string;
  idx: number;
  node?: Node;
  path?: string;
  label?: string;
  Icon?: LucideIcon;
  run: () => void;
}

export interface PaletteSection {
  key: string;
  title: string;
  items: PaletteItem[];
}

/** 静态操作组：命令面板不只是搜文件，也要能直接跳转常用去处 */
export const PALETTE_ACTIONS: { key: string; label: string; to: string; Icon: LucideIcon }[] = [
  { key: "act-new", label: "新建文件夹", to: "/?newFolder=1", Icon: FilePlus2 },
  { key: "act-recent", label: "转到最近访问", to: "/recent", Icon: Clock },
  { key: "act-fav", label: "转到收藏", to: "/favorites", Icon: Star },
  { key: "act-trash", label: "转到回收站", to: "/trash", Icon: Trash2 },
];
