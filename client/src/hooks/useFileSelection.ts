import { useCallback, useState } from "react";

export interface FileSelection {
  /** 已选节点 id 集合 */
  selected: ReadonlySet<string>;
  /** 已选数量 */
  count: number;
  isSelected: (id: string) => boolean;
  /** Ctrl/Cmd 点选：取反并把范围锚点移到该 id */
  toggle: (id: string) => void;
  /** Shift 范围选：选中锚点 → id（含两端），替换当前选择 */
  selectRange: (id: string) => void;
  /** 全选当前列表 */
  selectAll: () => void;
  clear: () => void;
}

/**
 * 文件多选状态：受控 ids（当前目录有序列表）+ Shift 范围锚点。
 * resetKey（如目录 id）变化时自动清空选择与锚点。
 */
export function useFileSelection(ids: readonly string[], resetKey?: string | number): FileSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);

  // resetKey 变化（换目录）→ 清空（渲染期调整 state，避免多余一次提交）
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setSelected(new Set());
    setAnchor(null);
  }

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  }, []);

  const selectRange = useCallback(
    (id: string) => {
      setSelected(() => {
        if (anchor === null) return new Set([id]);
        const a = ids.indexOf(anchor);
        const b = ids.indexOf(id);
        if (a === -1 || b === -1) return new Set([id]);
        const [from, to] = a <= b ? [a, b] : [b, a];
        return new Set(ids.slice(from, to + 1));
      });
    },
    [anchor, ids],
  );

  const selectAll = useCallback(() => setSelected(new Set(ids)), [ids]);

  const clear = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return { selected, count: selected.size, isSelected, toggle, selectRange, selectAll, clear };
}
