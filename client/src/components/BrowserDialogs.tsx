import type { useBrowserDialogs } from "../hooks/useBrowserDialogs";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import MoveDialog from "./MoveDialog";
import NameDialog from "./NameDialog";
import ShareDialog from "./ShareDialog";
import { TagDialog } from "./TagDialog";

type Dialogs = ReturnType<typeof useBrowserDialogs>;

interface Ops {
  mkDir: { isPending: boolean; mutate: (name: string, options?: { onSuccess?: () => void }) => void };
  rename: { isPending: boolean; mutate: (v: { id: string; name: string }, options?: { onSuccess?: () => void }) => void };
  remove: { mutate: (id: string) => void };
  move: { isPending: boolean; mutate: (v: { id: string; to: string }, options?: { onSuccess?: () => void }) => void };
  purgeNow: (id: string) => Promise<void>;
  runBatchDelete: (permanent: boolean) => Promise<void>;
  runBatchMove: (to: string) => Promise<void>;
  copy: { isPending: boolean; mutate: (v: { id: string; to: string }, options?: { onSuccess?: () => void }) => void };
  deleteBusy: boolean;
  batchBusy: boolean;
  selectedCount: number;
  batchDeleting: boolean;
  setBatchDeleting: (v: boolean) => void;
  batchMoving: boolean;
  setBatchMoving: (v: boolean) => void;
}

/**
 * 文件页的弹窗集合：一处渲染 7 个弹窗，页面不再散落大量条件 JSX。
 * 状态由 useBrowserDialogs 提供，动作与 mutation 由页面注入（保持数据层归属清晰）。
 */
export function BrowserDialogs({ dialogs, ops }: { dialogs: Dialogs; ops: Ops }) {
  const { sharing, setSharing, creating, setCreating, renaming, setRenaming, deleting, setDeleting, moving, setMoving, copying, setCopying, tagging, setTagging } = dialogs;
  const { mkDir, rename, remove, move, copy, purgeNow, deleteBusy } = ops;

  return (
    <>
      {sharing && <ShareDialog node={sharing} onClose={() => setSharing(null)} />}
      {tagging && <TagDialog node={tagging} onClose={() => setTagging(null)} />}
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
      {deleting && (
        <ConfirmDialog
          open
          title={`删除「${deleting.name}」`}
          description={`确定删除「${deleting.name}」？可在回收站恢复。`}
          confirmText="删除"
          danger
          busy={deleteBusy}
          extraAction={{ label: "彻底删除", onClick: () => void purgeNow(deleting.id) }}
          onConfirm={() => {
            remove.mutate(deleting.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
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
      {copying && (
        <MoveDialog
          title={`复制「${copying.name}」到…`}
          excludeId={copying.is_dir ? copying.id : undefined}
          busy={copy.isPending}
          onSubmit={(to) => copy.mutate({ id: copying.id, to }, { onSuccess: () => setCopying(null) })}
          onCancel={() => setCopying(null)}
        />
      )}
      {ops.batchDeleting && (
        <ConfirmDialog
          open
          title={`删除选中的 ${ops.selectedCount} 项`}
          description={`确定删除选中的 ${ops.selectedCount} 项？可在回收站恢复。`}
          confirmText="删除"
          danger
          busy={ops.batchBusy}
          extraAction={{ label: "彻底删除", onClick: () => void ops.runBatchDelete(true) }}
          onConfirm={() => void ops.runBatchDelete(false)}
          onCancel={() => ops.setBatchDeleting(false)}
        />
      )}
      {ops.batchMoving && (
        <MoveDialog
          title={`移动 ${ops.selectedCount} 项到…`}
          busy={ops.batchBusy}
          onSubmit={(to) => void ops.runBatchMove(to)}
          onCancel={() => ops.setBatchMoving(false)}
        />
      )}
    </>
  );
}
