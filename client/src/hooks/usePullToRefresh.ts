import { useEffect, useRef, useState } from "react";

/**
 * 移动端下拉刷新：仅在页面滚到顶部时生效，下拉超过阈值（默认 70px）松手触发刷新。
 * 只处理触摸事件，不影响桌面鼠标交互；刷新期间忽略新的手势。
 */
export function usePullToRefresh(onRefresh: () => void | Promise<unknown>, threshold = 70) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const active = useRef(false);
  const pullRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (busyRef.current || window.scrollY > 0) return;
      startY.current = e.touches[0]?.clientY ?? 0;
      active.current = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active.current) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      const next = dy > 0 ? Math.min(110, dy) : 0;
      pullRef.current = next;
      setPull(next);
    };
    const onEnd = () => {
      if (!active.current) return;
      active.current = false;
      const dy = pullRef.current;
      pullRef.current = 0;
      setPull(0);
      if (dy < threshold) return;
      busyRef.current = true;
      setRefreshing(true);
      void Promise.resolve(onRefresh()).finally(() => {
        busyRef.current = false;
        setRefreshing(false);
      });
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [onRefresh, threshold]);

  return { pull, refreshing, ready: pull >= threshold };
}
