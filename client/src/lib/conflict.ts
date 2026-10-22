/** 同名文件冲突策略：保留两者（自动改名）/ 覆盖 / 跳过。规则与 UI 解耦，可被 hook 与组件共用。 */
export type ConflictPolicy = "keepBoth" | "overwrite" | "skip";

/** 自动改名：name (1).ext，避免与现有名称和本批已占用名称冲突 */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; i < 1000; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}
