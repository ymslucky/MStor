import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getMe } from "../api/me";
import type { Me } from "../api/types";
import { queryKeys } from "../lib/queryKeys";
import { STORAGE_KEYS, getString, setString } from "../lib/storage";

/** 当前登录视图（含 act-as 后的空间用户） */
export function useMe(): Me | undefined {
  const { data } = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  return data;
}

/** 侧栏折叠状态持久化（localStorage: mstor_sidebar） */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => getString(STORAGE_KEYS.sidebar) === "collapsed");
  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      setString(STORAGE_KEYS.sidebar, next ? "collapsed" : "expanded");
      return next;
    });
  return { collapsed, toggle };
}
