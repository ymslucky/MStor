import type * as React from "react";
import { cn } from "../../lib/cn";

/**
 * 内容表面（卡片/面板）：唯一的「描边 + 圆角 + 投影」出处。
 * 不要再手写 `rounded-card border border-line bg-surface-1` 这类组合。
 * tone: card=最轻（列表/表单），raised=浮层（弹窗内分组、下拉）
 */
export function Surface({
  tone = "card",
  className = "",
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "card" | "raised" }) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface-1",
        tone === "raised" ? "shadow-lift" : "",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
