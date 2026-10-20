import type * as React from "react";
import { cn } from "../../lib/cn";

/**
 * 浮层容器（E2/E3）：顶栏下拉、右键菜单、抽屉、弹窗内容壳。
 * E2 = 悬浮于内容（glass），E3 = 阻塞上下文（glass-strong）。禁止用 !important 或更大 z-index 硬压。
 */
export function Panel({
  level = "e2",
  className = "",
  children,
  ...rest
}: React.ComponentPropsWithRef<"div"> & { level?: "e2" | "e3" }) {
  return (
    <div className={cn(level === "e3" ? "glass-strong" : "glass", "p-2", className)} {...rest}>
      {children}
    </div>
  );
}
