import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { listShares } from "../api/shares";
import { listTrash } from "../api/trash";
import type { Me, Node } from "../api/types";
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
import { formatBytes } from "../lib/format";

// 粉彩图标芯片：浅底 + 饱和前景（token 见 index.css chip-*）
function KpiChip({ tone, icon }: { tone: "amber" | "blue" | "violet" | "rose"; icon: string }) {
  const tones = {
    amber: "bg-chip-amber-bg text-chip-amber-fg",
    blue: "bg-chip-blue-bg text-chip-blue-fg",
    violet: "bg-chip-violet-bg text-chip-violet-fg",
    rose: "bg-chip-rose-bg text-chip-rose-fg",
  };
  return (
    <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${tones[tone]}`}>
      {icon}
    </span>
  );
}

// 存储圆环：底环 gray-100，进度环 accent，中心百分比
function StorageRing({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-gray-100" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-accent"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-ink">{pct}%</span>
    </div>
  );
}

const quickCls =
  "flex min-h-[44px] items-center gap-3 rounded-card border border-line bg-white p-3 text-sm font-medium text-ink shadow-card transition-shadow hover:shadow-lift";

export default function Browser() {
  const [params, setParams] = useSearchParams();
  const dir = params.get("dir") ?? "";
  const me = useOutletContext<Me | null>();
  const { query, mkDir, rename, move, remove } = useFiles(dir);
  const sharesQuery = useQuery({ queryKey: ["shares"], queryFn: listShares });
  const trashQuery = useQuery({ queryKey: ["trash"], queryFn: listTrash });
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

  const used = me?.usedBytes ?? 0;
  const quota = me?.quotaBytes ?? 0;
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

  return (
    <div>
      {/* KPI 卡行 */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <GlassCard className="flex items-center gap-3 p-4">
          <StorageRing pct={pct} />
          <div className="min-w-0">
            <div className="text-xs text-ink-faint">存储用量</div>
            <div className="truncate text-sm font-semibold text-ink" title={`${formatBytes(used)} / ${formatBytes(quota)}`}>
              {me ? `${formatBytes(used)} / ${formatBytes(quota)}` : "-"}
            </div>
          </div>
        </GlassCard>
        <GlassCard className="flex items-center gap-3 p-4">
          <KpiChip tone="amber" icon="📦" />
          <div className="min-w-0">
            <div className="text-xs text-ink-faint">空间配额</div>
            <div className="truncate text-sm font-semibold text-ink">{me ? formatBytes(quota) : "-"}</div>
          </div>
        </GlassCard>
        <GlassCard className="flex items-center gap-3 p-4">
          <KpiChip tone="blue" icon="🌐" />
          <div className="min-w-0">
            <div className="text-xs text-ink-faint">我的分享</div>
            <div className="text-sm font-semibold text-ink">
              {sharesQuery.isError ? "-" : (sharesQuery.data?.shares.length ?? "-")}
            </div>
          </div>
        </GlassCard>
        <GlassCard className="flex items-center gap-3 p-4">
          <KpiChip tone="rose" icon="🗑️" />
          <div className="min-w-0">
            <div className="text-xs text-ink-faint">回收站文件</div>
            <div className="text-sm font-semibold text-ink">
              {trashQuery.isError ? "-" : (trashQuery.data?.nodes.length ?? "-")}
            </div>
          </div>
        </GlassCard>
      </div>
      {/* 快捷操作行 */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button type="button" aria-label="上传" className={quickCls} onClick={() => fileInput.current?.click()}>
          <KpiChip tone="violet" icon="⬆️" />
          上传
        </button>
        <button type="button" aria-label="新建文件夹" className={quickCls} onClick={() => setCreating(true)}>
          <KpiChip tone="blue" icon="🆕" />
          新建文件夹
        </button>
        <Link to="/shares" className={quickCls}>
          <KpiChip tone="amber" icon="🔗" />
          管理分享
        </Link>
        <Link to="/trash" className={quickCls}>
          <KpiChip tone="rose" icon="🗑️" />
          回收站
        </Link>
      </div>
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
      {query.data && (
        <div className="mb-3">
          <Breadcrumb crumbs={query.data.breadcrumb} />
        </div>
      )}
      {query.isPending && (
        <GlassCard className="p-3 sm:p-4">
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-gray-50/50 p-3">
                <Skeleton className="h-9 w-9 shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="hidden h-4 w-16 sm:block" />
                <Skeleton className="h-4 w-20 shrink-0" />
              </div>
            ))}
          </div>
        </GlassCard>
      )}
      {query.isError && (
        <GlassCard className="p-3 sm:p-4">
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
        </GlassCard>
      )}
      {query.data && (
        <GlassCard className="p-3 sm:p-4">
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
        </GlassCard>
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
