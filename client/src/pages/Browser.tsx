import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { listShares } from "../api/shares";
import { listTrash } from "../api/trash";
import type { Me, Node } from "../api/types";
import { contentUrl, deleteNode, moveNode } from "../api/nodes";
import Breadcrumb from "../components/Breadcrumb";
import ContextMenu from "../components/ContextMenu";
import type { ContextMenuItem } from "../components/ContextMenu";
import FileList from "../components/FileList";
import MoveDialog from "../components/MoveDialog";
import NameDialog from "../components/NameDialog";
import PreviewModal from "../components/PreviewModal";
import ShareDialog from "../components/ShareDialog";
import UploadPanel from "../components/UploadPanel";
import { toast } from "../components/Toaster";
import { Button, ConfirmDialog, EmptyState, GlassCard, IconButton, Skeleton } from "../components/ui";
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

// drop 的 dataTransfer 含目录条目（拖入文件夹）时忽略，提示压缩后上传
function dropHasDirectory(dt: DataTransfer | null): boolean {
  const items = dt?.items;
  if (!items) return false;
  for (let i = 0; i < items.length; i++) {
    if (items[i].webkitGetAsEntry()?.isDirectory) return true;
  }
  return false;
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
  const [deleting, setDeleting] = useState<Node | null>(null);
  // 批量选择状态（换目录清空）
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchMoving, setBatchMoving] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  // 视图偏好持久化，缺省 list
  const [view, setView] = useState<"list" | "grid">(() => (localStorage.getItem("mstor_view") === "grid" ? "grid" : "list"));
  // 拖拽上传：dragenter/leave 计数法防子元素闪烁，>0 时显示全屏覆盖层
  const [dragDepth, setDragDepth] = useState(0);
  // 右键菜单：当前节点 + 指针位置
  const [menu, setMenu] = useState<{ node: Node; x: number; y: number } | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => setSelected(new Set()), [dir]);

  const openDir = (id: string) => setParams(id ? { dir: id } : {});

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const switchView = (v: "list" | "grid") => {
    setView(v);
    localStorage.setItem("mstor_view", v);
  };

  // 批量删除：顺序逐个删除，完成后失效 files + trash 缓存
  const runBatchDelete = async () => {
    setBatchBusy(true);
    try {
      for (const id of selected) await deleteNode(id);
      setSelected(new Set());
    } finally {
      setBatchBusy(false);
      setBatchDeleting(false);
    }
    void queryClient.invalidateQueries({ queryKey: ["files"] });
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
  };

  // 批量移动：顺序逐个移动
  const runBatchMove = async (to: string) => {
    setBatchBusy(true);
    try {
      for (const id of selected) await moveNode(id, to);
      setSelected(new Set());
    } finally {
      setBatchBusy(false);
      setBatchMoving(false);
    }
    void queryClient.invalidateQueries({ queryKey: ["files"] });
  };

  // 批量下载：仅文件，300ms 间隔逐个触发（避免浏览器拦截）
  const batchDownload = () => {
    const files = (query.data?.nodes ?? []).filter((n) => selected.has(n.id) && !n.is_dir);
    files.forEach((n, i) =>
      window.setTimeout(() => {
        const a = document.createElement("a");
        a.href = contentUrl(n.id, true);
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 300),
    );
  };

  const selectedNodes = (query.data?.nodes ?? []).filter((n) => selected.has(n.id));
  const hasFileSelected = selectedNodes.some((n) => !n.is_dir);

  // 单文件下载：临时 <a> 触发 content?dl=1
  const downloadNode = (n: Node) => {
    const a = document.createElement("a");
    a.href = contentUrl(n.id, true);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // 右键菜单项：复用既有打开/分享/重命名/移动/删除处理，目录无下载
  const menuItemsFor = (n: Node): ContextMenuItem[] => [
    {
      label: "打开",
      icon: "↗️",
      onClick: () => {
        setMenu(null);
        if (n.is_dir) openDir(n.id);
        else setPreview(n);
      },
    },
    ...(n.is_dir
      ? []
      : [
          {
            label: "下载",
            icon: "⬇️",
            onClick: () => {
              setMenu(null);
              downloadNode(n);
            },
          },
        ]),
    {
      label: "分享",
      icon: "🔗",
      onClick: () => {
        setMenu(null);
        setSharing(n);
      },
    },
    {
      label: "重命名",
      icon: "✏️",
      onClick: () => {
        setMenu(null);
        setRenaming(n);
      },
    },
    {
      label: "移动",
      icon: "📂",
      onClick: () => {
        setMenu(null);
        setMoving(n);
      },
    },
    {
      label: "删除",
      icon: "🗑️",
      danger: true,
      onClick: () => {
        setMenu(null);
        setDeleting(n);
      },
    },
  ];

  // 行/卡片右键：打开于指针处（组件内越界翻转）
  const onNodeContextMenu = (e: ReactMouseEvent<HTMLElement>, node: Node) => {
    e.preventDefault();
    setMenu({ node, x: e.clientX, y: e.clientY });
  };

  // 空目录 CTA：复用上传入口与新建文件夹
  const emptyDirActions = (
    <div className="flex flex-wrap justify-center gap-2">
      <Button size="sm" onClick={() => fileInput.current?.click()}>
        上传文件
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
        新建文件夹
      </Button>
    </div>
  );

  const used = me?.usedBytes ?? 0;
  const quota = me?.quotaBytes ?? 0;
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

  return (
    <div
      data-testid="drop-zone"
      onDragEnter={(e) => {
        e.preventDefault();
        setDragDepth((d) => d + 1);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragDepth((d) => Math.max(0, d - 1))}
      onDrop={(e) => {
        e.preventDefault();
        setDragDepth(0);
        if (dropHasDirectory(e.dataTransfer)) {
          toast("文件夹暂不支持，请压缩后上传");
          return;
        }
        const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
        if (files.length) queue.add(files, dir);
      }}
    >
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
          {/* 工具栏：右侧列表/网格分段控件 */}
          <div className="mb-3 flex items-center justify-end">
            <div role="group" aria-label="视图切换" className="inline-flex items-center gap-1 rounded-xl border border-line bg-gray-50 p-1">
              <IconButton label="列表视图" active={view === "list"} aria-pressed={view === "list"} onClick={() => switchView("list")}>
                <span aria-hidden>☰</span>
              </IconButton>
              <IconButton label="网格视图" active={view === "grid"} aria-pressed={view === "grid"} onClick={() => switchView("grid")}>
                <span aria-hidden>▦</span>
              </IconButton>
            </div>
          </div>
          <FileList
            nodes={query.data.nodes}
            view={view}
            selectable
            selected={selected}
            onToggle={toggleSelect}
            onOpenDir={openDir}
            onOpenFile={setPreview}
            onNodeContextMenu={onNodeContextMenu}
            emptyActions={emptyDirActions}
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
                <IconButton label={`删除 ${n.name}`} onClick={() => setDeleting(n)}>
                  <span aria-hidden>🗑️</span>
                </IconButton>
              </>
            )}
          />
        </GlassCard>
      )}
      <UploadPanel queue={queue} />
      {/* 批量操作条：选中 ≥1 项时浮出，移动端避让底部导航（bottom-20） */}
      {selected.size > 0 && !batchDeleting && !batchMoving && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 sm:bottom-6">
          <div className="flex items-center gap-1.5 rounded-card border border-line bg-white p-2 shadow-card">
            <span className="whitespace-nowrap px-2 text-sm font-medium text-ink">已选 {selected.size} 项</span>
            {hasFileSelected && (
              <Button size="sm" onClick={batchDownload}>
                下载
              </Button>
            )}
            <Button size="sm" onClick={() => setBatchMoving(true)}>
              移动
            </Button>
            <Button size="sm" variant="danger" onClick={() => setBatchDeleting(true)}>
              删除
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              取消
            </Button>
          </div>
        </div>
      )}
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
      {deleting && (
        <ConfirmDialog
          open
          title={`删除「${deleting.name}」`}
          description={`确定删除「${deleting.name}」？可在回收站恢复。`}
          confirmText="删除"
          danger
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
      {batchDeleting && (
        <ConfirmDialog
          open
          title={`删除选中的 ${selected.size} 项`}
          description={`确定删除选中的 ${selected.size} 项？可在回收站恢复。`}
          confirmText="删除"
          danger
          busy={batchBusy}
          onConfirm={() => void runBatchDelete()}
          onCancel={() => setBatchDeleting(false)}
        />
      )}
      {batchMoving && (
        <MoveDialog
          title={`移动 ${selected.size} 项到…`}
          busy={batchBusy}
          onSubmit={(to) => void runBatchMove(to)}
          onCancel={() => setBatchMoving(false)}
        />
      )}
      {/* 拖拽全屏覆盖层：白底 80% + 内嵌虚线框；drop/离开窗口后关闭（计数法归零） */}
      {dragDepth > 0 && (
        <div data-testid="drop-overlay" className="fixed inset-0 z-40 bg-white/80">
          <div className="absolute inset-3 flex items-center justify-center rounded-card border-2 border-dashed border-accent bg-white/60 sm:inset-6">
            <p className="text-sm font-medium text-ink">松开，上传到当前目录</p>
          </div>
        </div>
      )}
      {/* 右键菜单（移动端无右键，沿用行内按钮） */}
      {menu && <ContextMenu open x={menu.x} y={menu.y} items={menuItemsFor(menu.node)} onClose={() => setMenu(null)} />}
    </div>
  );
}
