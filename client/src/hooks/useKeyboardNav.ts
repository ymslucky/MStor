import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

export interface KeyboardNavOptions {
  /** 可导航行数 */
  count: number;
  /** 网格视图：←→ 也移动焦点 */
  horizontal?: boolean;
  /** 容器 ref：焦点移动后把 DOM 焦点落到 data-file-row 对应行（roving focus） */
  containerRef?: RefObject<HTMLElement | null>;
  /** resetKey（如目录 id）变化时重置焦点 */
  resetKey?: string | number;
  /** Enter 打开 */
  onOpen?: (index: number) => void;
  /** Delete 删除 */
  onDelete?: (index: number) => void;
  /** F2 重命名 */
  onRename?: (index: number) => void;
  /** Space 预览 */
  onPreview?: (index: number) => void;
  /** Ctrl/Cmd+A 全选 */
  onSelectAll?: () => void;
  /** Esc 清空选择 */
  onClearSelection?: () => void;
}

// 焦点落在表单控件时，Enter/Space/Delete 交给控件本身（checkbox 等）
const FORM_CONTROL = "input, textarea, select";
// 焦点落在按钮/链接上时 Enter/Space 是原生点击，交给原生行为
const NATIVE_ACTION = "button, a";

export function useKeyboardNav({
  count,
  horizontal = false,
  containerRef,
  resetKey,
  onOpen,
  onDelete,
  onRename,
  onPreview,
  onSelectAll,
  onClearSelection,
}: KeyboardNavOptions) {
  const [focusIndex, setFocusIndex] = useState(-1);

  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setFocusIndex(-1);
  }

  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));

  const move = (e: ReactKeyboardEvent, delta: number) => {
    e.preventDefault();
    if (count > 0) setFocusIndex((prev) => clamp(prev < 0 ? 0 : prev + delta));
  };

  // 网格视图的 ↑↓ 应跨行移动：列数从容器实际渲染的 grid-template-columns 读取（随断点/详情栏变化），
  // 读不到（jsdom / 非 grid 容器）时按 1 列退化为线性移动，与旧行为一致。
  const gridColumns = (): number => {
    if (!horizontal) return 1;
    const el = containerRef?.current;
    if (!el || typeof getComputedStyle !== "function") return 1;
    const template = getComputedStyle(el).gridTemplateColumns.trim();
    if (!template) return 1;
    const n = template.split(/\s+/).length;
    return n > 1 ? n : 1;
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    const inForm = !!target?.closest?.(FORM_CONTROL);
    const onNativeAction = !!target?.closest?.(NATIVE_ACTION);
    const hit = focusIndex >= 0 && focusIndex < count;
    // Esc 清空选择：即使焦点在行首 checkbox 上也要生效
    if (e.key === "Escape") {
      e.preventDefault();
      onClearSelection?.();
      return;
    }
    // 焦点在输入框/下拉/文本域时，方向键、Home/End 属于控件本身（移动光标），不能劫持为列表导航
    if (inForm) return;
    switch (e.key) {
      case "ArrowDown":
        return move(e, gridColumns());
      case "ArrowUp":
        return move(e, -gridColumns());
      case "Home":
        e.preventDefault();
        if (count > 0) setFocusIndex(0);
        return;
      case "End":
        e.preventDefault();
        if (count > 0) setFocusIndex(count - 1);
        return;
      case "ArrowRight":
        return horizontal ? move(e, 1) : undefined;
      case "ArrowLeft":
        return horizontal ? move(e, -1) : undefined;
      case "Enter":
        if (!inForm && !onNativeAction && hit) onOpen?.(focusIndex);
        return;
      case "Delete":
        if (!inForm && hit) onDelete?.(focusIndex);
        return;
      case "F2":
        if (!inForm && hit) onRename?.(focusIndex);
        return;
      case " ":
        if (inForm || onNativeAction) return;
        e.preventDefault();
        if (hit) onPreview?.(focusIndex);
        return;
      default:
        // 焦点在输入框内时不劫持 Ctrl+A（应选中输入框文本，而不是全选文件）
        if (inForm) return;
        if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
          e.preventDefault();
          onSelectAll?.();
        }
    }
  };

  // roving focus：ring 高亮行同时落到 DOM 焦点，后续按键从该行冒泡
  useEffect(() => {
    if (focusIndex < 0) return;
    containerRef?.current?.querySelector<HTMLElement>(`[data-file-row="${focusIndex}"]`)?.focus();
  }, [focusIndex, containerRef]);

  return { focusIndex, onKeyDown, focusRow: setFocusIndex };
}
