import type { WorkspaceSummary } from "../api/types";

/** 空间切换器：切空间 = 换租户（请求头 x-workspace + 整页重载） */
export function WorkspaceSwitcher({
  workspaces,
  currentId,
  onSwitch,
}: {
  workspaces: WorkspaceSummary[];
  currentId: string | undefined;
  onSwitch: (id: string) => void;
}) {
  if (workspaces.length <= 1) return null;
  return (
    <label className="block px-1">
      <span className="sr-only">切换空间</span>
      <select
        value={currentId ?? ""}
        onChange={(e) => onSwitch(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-ink"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}
