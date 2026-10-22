import { Search } from "lucide-react";
import { cn } from "../lib/cn";
import { Input } from "./ui";

/**
 * 带放大镜图标的搜索输入：列表过滤、审计筛选、用户搜索共用同一份「图标 + 内边距 + aria-label」。
 * 图标装饰位 aria-hidden，输入本身有 aria-label（不依赖 placeholder 作为可访问名称）。
 */
export function SearchInput({
  label,
  placeholder,
  value,
  onChange,
  className = "",
  inputClassName = "",
  type = "text",
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
  type?: "text" | "search";
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        size={14}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3"
      />
      <Input
        type={type}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-8 pl-8 text-xs", inputClassName)}
      />
    </div>
  );
}
