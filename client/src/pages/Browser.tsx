import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Node } from "../api/types";
import Breadcrumb from "../components/Breadcrumb";
import FileList from "../components/FileList";
import MoveDialog from "../components/MoveDialog";
import NameDialog from "../components/NameDialog";
import { useFiles } from "../hooks/useFiles";

export default function Browser() {
  const [params, setParams] = useSearchParams();
  const dir = params.get("dir") ?? "";
  const { query, mkDir, rename, move, remove } = useFiles(dir);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Node | null>(null);
  const [moving, setMoving] = useState<Node | null>(null);

  const openDir = (id: string) => setParams(id ? { dir: id } : {});

  const confirmDelete = (node: Node) => {
    if (window.confirm(`确定删除「${node.name}」？可在回收站恢复。`)) remove.mutate(node.id);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">{query.data && <Breadcrumb crumbs={query.data.breadcrumb} />}</div>
        <button
          className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          onClick={() => setCreating(true)}
        >
          新建文件夹
        </button>
      </div>
      {query.isPending && <div className="py-16 text-center text-sm text-slate-400">加载中…</div>}
      {query.data && (
        <FileList
          nodes={query.data.nodes}
          onOpenDir={openDir}
          onOpenFile={() => {}}
          actions={(n) => (
            <>
              <button className="text-slate-600 hover:underline" aria-label={`重命名 ${n.name}`} onClick={() => setRenaming(n)}>
                重命名
              </button>
              <button className="text-slate-600 hover:underline" aria-label={`移动 ${n.name}`} onClick={() => setMoving(n)}>
                移动
              </button>
              <button className="text-red-600 hover:underline" aria-label={`删除 ${n.name}`} onClick={() => confirmDelete(n)}>
                删除
              </button>
            </>
          )}
        />
      )}
      {creating && (
        <NameDialog
          title="新建文件夹"
          busy={mkDir.isPending}
          onSubmit={(name) => mkDir.mutate(name, { onSuccess: () => setCreating(false) })}
          onCancel={() => setCreating(false)}
        />
      )}
      {renaming && (
        <NameDialog
          title={`重命名「${renaming.name}」`}
          initial={renaming.name}
          busy={rename.isPending}
          onSubmit={(name) => rename.mutate({ id: renaming.id, name }, { onSuccess: () => setRenaming(null) })}
          onCancel={() => setRenaming(null)}
        />
      )}
      {moving && (
        <MoveDialog
          title={`移动「${moving.name}」到…`}
          excludeId={moving.is_dir ? moving.id : undefined}
          busy={move.isPending}
          onSubmit={(to) => move.mutate({ id: moving.id, to }, { onSuccess: () => setMoving(null) })}
          onCancel={() => setMoving(null)}
        />
      )}
    </div>
  );
}
