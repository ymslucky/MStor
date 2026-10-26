import { useQuery } from "@tanstack/react-query";
import { getMe } from "../api/me";
import type { Me } from "../api/types";
import { queryKeys } from "../lib/queryKeys";

/** 当前登录视图（含 act-as 后的空间用户） */
export function useMe(): Me | undefined {
  const { data } = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  return data;
}
