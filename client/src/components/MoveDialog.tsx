import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { friendlyMessage } from "../api/client";
import { listFiles } from "../api/nodes";
import { Button, Dialog, EmptyState } from "./ui";

export interface DirOption {
  id: string;
  name: string;
  depth: number;
}

/** 递归深度上限（防御异常数据/环）；超过后不再展开更深的目录 */
const MAX_DEPTH = 8;
/** 同层并发的 listFiles 请求上限：目录数多时比串行 N+1 快一个量级，又不会打爆浏览器连接数 */
const LEVEL_CONCURRENCY = 6;

/**
 * 可选目标目录清单（BFS、逐层并发）。
 * excludeId 命中时整棵子树跳过（不 push 也不入队），因此移动/复制目录时不会把自身后代列为目标。
 */
export async function listDirOptions(excludeId?: string, isCancelled?: () => boolean): Promise<DirOption[]> {
  const out: DirOption[] = [];
  let level: { parentId: string; prefix: string; depth: number }[] = [{ parentId: "", prefix: "", depth: 0 }];
  while (level.length) {
    if (isCancelled?.()) return out;
    const next: typeof level = [];
    for (let i = 0; i < level.length; i += LEVEL_CONCURRENCY) {
      // 对话框关闭后不再发起新的批次（已发出的请求无法中断，但不再扩大扫描）
      if (isCancelled?.()) return out;
      const batch = level.slice(i, i + LEVEL_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async ({ parentId, prefix, depth }) => {
          const { nodes } = await listFiles(parentId);
          return { prefix, depth, nodes };
        }),
      );
      for (const { prefix, depth, nodes } of results) {
        for (const n of nodes) {
          if (!n.is_dir || n.id === excludeId) continue;
          const label = prefix ? `${prefix}/${n.name}` : n.name;
          out.push({ id: n.id, name: label, depth });
          if (depth < MAX_DEPTH) next.push({ parentId: n.id, prefix: label, depth: depth + 1 });
        }
      }
    }
    level = next;
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return out;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; dirs: DirOption[] };

interface Props {
  title: string;
  excludeId?: string;
  onSubmit: (targetId: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * 目录选择器：打开时读取可选目录（失败可重试，关闭后丢弃结果）。
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
      (dirs) => {
        if (!cancelled) setState({ status: "ready", dirs });
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
