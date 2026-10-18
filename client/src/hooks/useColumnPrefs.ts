import { useState } from "react";
import type { Node } from "../api/types";
import { STORAGE_KEYS, getJSON, setJSON } from "../lib/storage";

// 列偏好（localStorage，不入库）：名称列宽 / 列显示 / 排序
export type SortKey = "name" | "size" | "updated_at";
export interface ColPref {
  nameW?: number;
  showSize?: boolean;
  showTime?: boolean;
  sort?: { key: SortKey; dir: "asc" | "desc" } | null;
}
const DEFAULT_PREF = { showSize: true, showTime: true };

// 排序：文件夹始终置顶（按名称），文件间按所选键 × 方向
export function compareNodes(a: Node, b: Node, key: SortKey, dir: 1 | -1): number {
  if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
  if (a.is_dir) return a.name.localeCompare(b.name, "zh-CN");
  const v =
    key === "name"
      ? a.name.localeCompare(b.name, "zh-CN")
      : key === "size"
        ? (a.size ?? 0) - (b.size ?? 0)
        : a.updated_at - b.updated_at;
  return v * dir;
}

/** 列偏好状态 + 持久化 + 排序切换/指示 */
export function useColumnPrefs() {
  const [pref, setPref] = useState<ColPref>(() => ({ ...DEFAULT_PREF, ...getJSON<ColPref>(STORAGE_KEYS.filesTable, {}) }));

  const setPrefAndSave = (p: ColPref) => {
    setPref(p);
    setJSON(STORAGE_KEYS.filesTable, p);
  };
  const updatePref = (fn: (p: ColPref) => ColPref) =>
    setPref((prev) => {
      const next = fn(prev);
      setJSON(STORAGE_KEYS.filesTable, next);
      return next;
    });

  // 表头排序切换：同列第三次点击取消排序
  const toggleSort = (key: SortKey) => {
    const cur = pref.sort;
    const next =
      !cur || cur.key !== key ? { key, dir: "asc" as const } : cur.dir === "asc" ? { key, dir: "desc" as const } : null;
    setPrefAndSave({ ...pref, sort: next });
  };

  return { pref, setPrefAndSave, updatePref, toggleSort };
}