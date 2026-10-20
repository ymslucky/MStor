import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 类名合并：条件类 + Tailwind 冲突消解（后者覆盖前者），原语统一入口 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
