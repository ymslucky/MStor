import { useEffect, useState } from "react";
import { listFiles } from "../api/nodes";

export interface DirOption {
  id: string;
  name: string;
  depth: number;
}

// 家族规模目录数有限：打开时一次性递归拉取全部目录（深度上限 8 兜底）
export async function listDirOptions(excludeId?: string): Promise<DirOption[]> {
  const out: DirOption[] = [];
  async function walk(parentId: string, prefix: string, depth: number) {
    if (depth > 8) return;
    const { nodes } = await listFiles(parentId);
    for (const n of nodes.filter((x) => x.is_dir)) {
      if (n.id === excludeId) continue;
      const label = prefix ? `${prefix}/${n.name}` : n.name;
      out.push({ id: n.id, name: label, depth });
      await walk(n.id, label, depth + 1);
    }
  }
  await walk("", "", 0);
  return out;
}

interface Props {
  title: string;
  excludeId?: string;
  onSubmit: (targetId: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

export default function MoveDialog({ title, excludeId, onSubmit, onCancel, busy }: Props) {
  const [dirs, setDirs] = useState<DirOption[] | null>(null);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    listDirOptions(excludeId).then(setDirs);
  }, [excludeId]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-80 rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 font-semibold">{title}</h2>
        {!dirs ? (
          <div className="py-6 text-center text-sm text-slate-400">加载中…</div>
        ) : (
          <div className="max-h-64 space-y-0.5 overflow-auto" role="listbox" aria-label="目标目录">
            <button
              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-blue-50"
              onClick={() => setSelected("")}
              style={{ fontWeight: selected === "" ? 600 : 400 }}
            >
              根目录
            </button>
            {dirs.map((d) => (
              <button
                key={d.id}
                className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-blue-50"
                style={{ paddingLeft: `${d.depth * 16 + 8}px`, fontWeight: selected === d.id ? 600 : 400 }}
                onClick={() => setSelected(d.id)}
              >
                {d.name}
              </button>
            ))}
            {!dirs.length && <div className="px-2 py-1 text-xs text-slate-400">暂无其他文件夹</div>}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2 text-sm">
          <button className="rounded px-3 py-1.5 hover:bg-slate-100" onClick={onCancel}>取消</button>
          <button
            className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
            disabled={dirs === null || busy}
            onClick={() => onSubmit(selected)}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
