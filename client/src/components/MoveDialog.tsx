import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { friendlyMessage } from "../api/client";
import { listDirTree } from "../api/nodes";
import type { DirTreeRow } from "../api/nodes";
import { Button, Dialog, EmptyState } from "./ui";

export interface DirOption {
  id: string;
  name: string;
  depth: number;
}

/** 递归深度上限（防御异常数据/环）；超过后不再展开更深的目录 */
const MAX_DEPTH = 8;

export interface DirOptionsResult {
  options: DirOption[];
  /** 服务端超过 5000 条上限，列表可能不完整 */
  truncated: boolean;
}

/**
 * 可选目标目录清单：一次 `GET /api/dirs/tree` 后在前端建树（替代逐目录 N+1）。
 * excludeId 命中时整棵子树跳过，因此移动/复制目录时不会把自身后代列为目标。
 */
export async function listDirOptions(excludeId?: string, isCancelled?: () => boolean): Promise<DirOptionsResult> {
  const { dirs, truncated } = await listDirTree();
  if (isCancelled?.()) return { options: [], truncated };

  // 防御：根哨兵行 name='' 不应作为可选目标
  const visible = dirs.filter((d) => d.name !== "");
  const byId = new Map(visible.map((d) => [d.id, d]));
  const children = new Map<string, DirTreeRow[]>();
  for (const d of visible) {
    // parent 不在结果里（根哨兵行）即视为根级
    const parentKey = byId.has(d.parent_id) ? d.parent_id : "";
    const list = children.get(parentKey) ?? [];
    list.push(d);
    children.set(parentKey, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

  const options: DirOption[] = [];
  const walk = (parentId: string, prefix: string, depth: number) => {
    for (const d of children.get(parentId) ?? []) {
      if (d.id === excludeId) continue; // 整棵子树跳过（不入队也不递归）
      const label = prefix ? `${prefix}/${d.name}` : d.name;
      options.push({ id: d.id, name: label, depth });
      if (depth < MAX_DEPTH) walk(d.id, label, depth + 1);
    }
  };
  walk("", "", 0);
  return { options, truncated };
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; dirs: DirOption[]; truncated: boolean };

interface Props {
  title: string;
  excludeId?: string;
  onSubmit: (targetId: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * 目录选择器：一次请求读取可选目录（失败可重试，关闭后丢弃结果）。
 * 目标目录用 `aria-pressed` 的按钮组表达（不再用缺 option 子项的 listbox），并显示当前选择。
 */
export default function MoveDialog({ title, excludeId, onSubmit, onCancel, busy }: Props) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    listDirOptions(excludeId, () => cancelled).then(
      ({ options, truncated }) => {
        if (!cancelled) setState({ status: "ready", dirs: options, truncated });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [excludeId, attempt]);

  const targetName =
    selected === ""
      ? "根目录"
      : state.status === "ready"
        ? (state.dirs.find((d) => d.id === selected)?.name ?? "已选目录")
        : "已选目录";

  return (
    <Dialog
      open
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button disabled={state.status !== "ready" || busy} onClick={() => onSubmit(selected)}>
            {busy ? "处理中…" : "确定"}
          </Button>
        </>
      }
    >
      {state.status === "loading" && (
        <div className="py-6 text-center text-sm text-ink-3" aria-busy="true">
          正在读取目录…
        </div>
      )}

      {state.status === "error" && (
        <EmptyState
          icon={TriangleAlert}
          title="目录加载失败"
          description={friendlyMessage(state.error)}
          action={
            <Button variant="ghost" onClick={() => setAttempt((a) => a + 1)}>
              重试
            </Button>
          }
        />
      )}

      {state.status === "ready" && (
        <>
          <p className="mb-2 text-xs text-ink-3">
            目标：<span className="text-ink-2">{targetName}</span>
          </p>
          {state.truncated && (
            <p className="mb-2 rounded-lg bg-warn-soft px-2 py-1 text-2xs text-warn-text">
              目录过多，仅显示前 5000 个，未列出的目录可先精简后再移动。
            </p>
          )}
          <div className="max-h-64 space-y-0.5 overflow-auto" role="group" aria-label="目标目录">
            <button
              type="button"
              aria-pressed={selected === ""}
              className={`block w-full rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                selected === "" ? "bg-primary-soft font-medium text-primary-text" : "text-ink hover:bg-bg-sub"
              }`}
              onClick={() => setSelected("")}
            >
              根目录
            </button>
            {state.dirs.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={selected === d.id}
                title={d.name}
                className={`block w-full truncate rounded-lg py-2 pr-2 text-left text-sm transition-colors ${
                  selected === d.id ? "bg-primary-soft font-medium text-primary-text" : "text-ink hover:bg-bg-sub"
                }`}
                style={{ paddingLeft: `${d.depth * 16 + 8}px` }}
                onClick={() => setSelected(d.id)}
              >
                {d.name}
              </button>
            ))}
            {!state.dirs.length && <div className="px-2 py-1 text-xs text-ink-3">暂无其他文件夹</div>}
          </div>
        </>
      )}
    </Dialog>
  );
}
