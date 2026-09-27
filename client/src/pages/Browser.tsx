import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Node } from "../api/types";
import Breadcrumb from "../components/Breadcrumb";
import FileList from "../components/FileList";
import MoveDialog from "../components/MoveDialog";
import NameDialog from "../components/NameDialog";
import PreviewModal from "../components/PreviewModal";
import ShareDialog from "../components/ShareDialog";
import UploadPanel from "../components/UploadPanel";
import { Button, EmptyState, GlassCard, IconButton, Skeleton } from "../components/ui";
import { useFiles } from "../hooks/useFiles";
import { useUploadQueue } from "../hooks/useUploadQueue";

export default function Browser() {
  const [params, setParams] = useSearchParams();
  const dir = params.get("dir") ?? "";
  const { query, mkDir, rename, move, remove } = useFiles(dir);
  const fileInput = useRef<HTMLInputElement>(null);
  const queue = useUploadQueue();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Node | null>(null);
  const [moving, setMoving] = useState<Node | null>(null);
  const [preview, setPreview] = useState<Node | null>(null);
  const [sharing, setSharing] = useState<Node | null>(null);

  const openDir = (id: string) => setParams(id ? { dir: id } : {});

  const confirmDelete = (node: Node) => {
    if (window.confirm(`确定删除「${node.name}」？可在回收站恢复。`)) remove.mutate(node.id);
  };

  return (
    <div>
      <GlassCard className="mb-3 flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="min-w-0 flex-1">{query.data && <Breadcrumb crumbs={query.data.breadcrumb} />}</div>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) queue.add(Array.from(e.target.files), dir);
            e.target.value = "";
          }}
        />
        <Button variant="ghost" aria-label="上传" onClick={() => fileInput.current?.click()}>
          <span aria-hidden>⬆️</span>
          <span className="hidden sm:inline">上传</span>
        </Button>
        <Button aria-label="新建文件夹" onClick={() => setCreating(true)}>
          <span aria-hidden>🆕</span>
          <span className="hidden sm:inline">新建文件夹</span>
        </Button>
      </GlassCard>
      {query.isPending && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <Skeleton className="h-9 w-9 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-16 sm:block" />
              <Skeleton className="h-4 w-20 shrink-0" />
            </div>
          ))}
        </div>
      )}
      {query.isError && (
        <EmptyState
          icon="⚠️"
          title="加载失败"
          description="请检查网络或刷新页面重试"
          action={
            <Button variant="ghost" onClick={() => void query.refetch()}>
              重试
            </Button>
          }
        />
      )}
      {query.data && (
        <FileList
          nodes={query.data.nodes}
          onOpenDir={openDir}
          onOpenFile={setPreview}
          actions={(n) => (
            <>
              <IconButton label={`分享 ${n.name}`} onClick={() => setSharing(n)}>
                <span aria-hidden>🔗</span>
              </IconButton>
              <IconButton label={`重命名 ${n.name}`} onClick={() => setRenaming(n)}>
                <span aria-hidden>✏️</span>
              </IconButton>
              <IconButton label={`移动 ${n.name}`} onClick={() => setMoving(n)}>
                <span aria-hidden>📂</span>
              </IconButton>
              <IconButton label={`删除 ${n.name}`} onClick={() => confirmDelete(n)}>
                <span aria-hidden>🗑️</span>
              </IconButton>
            </>
          )}
        />
      )}
      <UploadPanel queue={queue} />
      {preview && <PreviewModal key={preview.id} node={preview} onClose={() => setPreview(null)} />}
      {sharing && <ShareDialog node={sharing} onClose={() => setSharing(null)} />}
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
