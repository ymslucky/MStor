import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { Copy, Download, ExternalLink, FolderInput, FolderPlus, FolderUp, Info, LayoutGrid, Link2, List, Pencil, Share2, Trash2, TriangleAlert, Upload } from "lucide-react";
import { batchDeleteNodes, batchMoveNodes } from "../api/nodes";
import { friendlyMessage } from "../api/client";
import { listShares } from "../api/shares";
import type { Me, Node } from "../api/types";
import { contentUrl, deleteNode, deleteNodePermanently, moveNode } from "../api/nodes";
import Breadcrumb from "../components/Breadcrumb";
import ContextMenu from "../components/ContextMenu";
import type { ContextMenuItem } from "../components/ContextMenu";
import FileList, { RowAction } from "../components/FileList";
import MoveDialog from "../components/MoveDialog";
import NameDialog from "../components/NameDialog";
import PreviewModal from "../components/PreviewModal";
import ShareDialog from "../components/ShareDialog";
import UploadPanel from "../components/UploadPanel";
import { toast } from "../components/Toaster";
import { Button, ConfirmDialog, Dialog, EmptyState, GlassCard, IconButton, Skeleton } from "../components/ui";
import { useFiles } from "../hooks/useFiles";
import { useFileSelection } from "../hooks/useFileSelection";
import { useKeyboardNav } from "../hooks/useKeyboardNav";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { collectDirectory, collectUploads, supportsDirectoryPicker } from "../lib/dirscan";
import { formatBytes, formatDate } from "../lib/format";

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

// —— 前端过滤 chips（类型/时间）：纯前端过滤当前目录列表，不新增后端调用 ——
type TypeFilter = "all" | "image" | "video" | "doc";
type TimeFilter = "all" | "today" | "7d" | "30d";

const TYPE_CHIPS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "doc", label: "文档" },
];
// 时间组无「全部」项：点击已选 chip 再次取消
const TIME_CHIPS: { value: TimeFilter; label: string }[] = [
  { value: "today", label: "今天" },
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
];

function matchType(n: Node, f: TypeFilter): boolean {
  if (f === "all") return true;
  if (n.is_dir) return false;
  const mime = n.mime ?? "";
  if (f === "image") return mime.startsWith("image/");
  if (f === "video") return mime.startsWith("video/");
  return (
    mime.startsWith("text/") ||
    mime.startsWith("application/pdf") ||
    mime.startsWith("application/json") ||
    mime.startsWith("application/msword") ||
    mime.startsWith("application/rtf") ||
    mime.includes("officedocument") ||
    mime.includes("spreadsheet") ||
    mime.includes("presentation")
  );
}

function matchTime(n: Node, f: TimeFilter): boolean {
  if (f === "all") return true;
  if (f === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return n.updated_at >= d.getTime();
  }
  return n.updated_at >= Date.now() - (f === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;
}

function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const idle = "rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-accent/40";
  const active = "rounded-full border border-primary bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary-text";
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={value === o.value ? active : idle}
          onClick={() => onChange(value === o.value && !options.some((x) => x.value === "all") ? ("all" as T) : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Browser() {
  const [params, setParams] = useSearchParams();
  const dir = params.get("dir") ?? "";
  const me = useOutletContext<Me | null>();
  const { query, mkDir, rename, move, remove } = useFiles(dir);
  const sharesQuery = useQuery({ queryKey: ["shares"], queryFn: listShares });
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const queue = useUploadQueue();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Node | null>(null);
  const [moving, setMoving] = useState<Node | null>(null);
  const [preview, setPreview] = useState<Node | null>(null);
  const [sharing, setSharing] = useState<Node | null>(null);
  const [deleting, setDeleting] = useState<Node | null>(null);
  const [detail, setDetail] = useState<Node | null>(null);
  // 批量操作状态
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchMoving, setBatchMoving] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // 批量操作进度（done/total），完成或失败后置 null
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  // 视图偏好持久化，缺省 list
  const [view, setView] = useState<"list" | "grid">(() => (localStorage.getItem("mstor_view") === "grid" ? "grid" : "list"));
  // 拖拽上传：dragenter/leave 计数法防子元素闪烁，>0 时显示全屏覆盖层
  const [dragDepth, setDragDepth] = useState(0);
  // 右键菜单：当前节点 + 指针位置
  const [menu, setMenu] = useState<{ node: Node; x: number; y: number } | null>(null);
  // 前端过滤 chips
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const queryClient = useQueryClient();

  const openDir = (id: string) => setParams(id ? { dir: id } : {});

  // 过滤后的当前目录列表（键盘导航/选择/渲染都以可见列表为准）
  const allNodes = useMemo(() => query.data?.nodes ?? [], [query.data]);
  const filtered = typeFilter !== "all" || timeFilter !== "all";
  const nodes = useMemo(
    () => allNodes.filter((n) => matchType(n, typeFilter) && matchTime(n, timeFilter)),
    [allNodes, typeFilter, timeFilter],
  );

  // 多选（受控 ids + Shift 范围锚点；换目录自动清空）
  const visibleIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const selection = useFileSelection(visibleIds, dir);

  // 键盘导航：↑↓（网格加 ←→）移动焦点，Enter 打开 / Delete 删除 / F2 重命名 / Space 预览 / Ctrl+A 全选
  const keyboard = useKeyboardNav({
    count: nodes.length,
    horizontal: view === "grid",
    resetKey: dir,
    containerRef: listRef,
    onOpen: (i) => {
      const n = nodes[i];
      if (!n) return;
      if (n.is_dir) openDir(n.id);
      else setPreview(n);
    },
    onPreview: (i) => {
      const n = nodes[i];
      if (n && !n.is_dir) setPreview(n);
    },
    onDelete: (i) => {
      const n = nodes[i];
      if (n) setDeleting(n);
    },
    onRename: (i) => {
      const n = nodes[i];
      if (n) setRenaming(n);
    },
    onSelectAll: () => selection.selectAll(),
  });

  const switchView = (v: "list" | "grid") => {
    setView(v);
    localStorage.setItem("mstor_view", v);
  };

  // 批量请求分块并行：每块 100 个 id（服务端集合式处理，单请求毫秒级），2 路并发；进度按已处理条目推进
  const runChunkedParallel = async (ids: string[], worker: (chunk: string[]) => Promise<number>) => {
    const CHUNK = 100;
    const CONCURRENCY = 2;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    let done = 0;
    let failed = 0;
    let idx = 0;
    setBatchProgress({ done: 0, total: ids.length });
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
        for (;;) {
          const i = idx++;
          if (i >= chunks.length) break;
          try {
            done += await worker(chunks[i]);
          } catch {
            failed += chunks[i].length; // 整块请求失败（网络/4xx）计入失败
          }
          setBatchProgress({ done: Math.min(done + failed, ids.length), total: ids.length });
        }
      }),
    );
    return { done, failed };
  };

  // 批量删除：服务端 batch-delete 一次处理一块（无逐项 HTTP 往返），分块并行加速
  const runBatchDelete = async (permanent = false) => {
    setBatchBusy(true);
    const ids = [...selection.selected];
    const { done, failed } = await runChunkedParallel(ids, async (chunk) => {
      const r = await batchDeleteNodes(chunk, permanent);
      return r.deleted;
    });
    selection.clear();
    setBatchBusy(false);
    setBatchDeleting(false);
    setBatchProgress(null);
    if (failed > 0) toast(`部分项处理失败（${failed} 项），请重试`, "error");
    else toast(permanent ? `已彻底删除 ${done} 项` : `已移入回收站 ${done} 项`, "info");
    void queryClient.invalidateQueries({ queryKey: ["files"] });
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
    if (permanent) void queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  // 单项彻底删除：弹窗保持打开（busy），成功后关闭
  const purgeNow = async (id: string) => {
    setDeleteBusy(true);
    try {
      await deleteNodePermanently(id);
      setDeleting(null);
      toast("已彻底删除", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "彻底删除失败", "error");
    } finally {
      setDeleteBusy(false);
    }
    void queryClient.invalidateQueries({ queryKey: ["files"] });
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  // 批量移动：服务端 batch-move 一次处理一块，分块并行
  const runBatchMove = async (to: string) => {
    setBatchBusy(true);
    const ids = [...selection.selected];
    const { done, failed } = await runChunkedParallel(ids, async (chunk) => {
      const r = await batchMoveNodes(chunk, to);
      return r.moved;
    });
    selection.clear();
    setBatchBusy(false);
    setBatchMoving(false);
    setBatchProgress(null);
    if (failed > 0) toast(`部分项移动失败（${failed} 项），请重试`, "error");
    else toast(`已移动 ${done} 项`, "info");
    void queryClient.invalidateQueries({ queryKey: ["files"] });
  };

  // 批量下载：仅文件，300ms 间隔逐个触发（避免浏览器拦截）
  const batchDownload = () => {
    const files = allNodes.filter((n) => selection.selected.has(n.id) && !n.is_dir);
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

  const selectedNodes = allNodes.filter((n) => selection.selected.has(n.id));
  const hasFileSelected = selectedNodes.some((n) => !n.is_dir);

  // 单文件下载：临时 <a> 触发 content?dl=1
  const downloadNode = (n: Node) => {
    const a = document.createElement("a");
    a.href = contentUrl(n.id, true);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // 拖拽移动（文件夹行/面包屑 drop）：复用既有 moveNode
  const dropMove = (id: string, to: string) => {
    if (!id) return;
    move.mutate({ id, to });
  };

  // 共享标记：shares 列表里的节点 id
  const sharedIds = useMemo(
    () => new Set((sharesQuery.data?.shares ?? []).map((s) => s.node_id)),
    [sharesQuery.data],
  );

  // 右键菜单项：Lucide 图标；文件加复制链接（content URL）与详情
  const menuItemsFor = (n: Node): ContextMenuItem[] => [
    {
      label: "打开",
      icon: <ExternalLink size={14} aria-hidden />,
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
            icon: <Download size={14} aria-hidden />,
            onClick: () => {
              setMenu(null);
              downloadNode(n);
            },
          },
        ]),
    {
      label: "分享",
      icon: <Share2 size={14} aria-hidden />,
      onClick: () => {
        setMenu(null);
        setSharing(n);
      },
    },
    {
      label: "重命名",
      icon: <Pencil size={14} aria-hidden />,
      onClick: () => {
        setMenu(null);
        setRenaming(n);
      },
    },
    {
      label: "移动",
      icon: <FolderInput size={14} aria-hidden />,
      onClick: () => {
        setMenu(null);
        setMoving(n);
      },
    },
    ...(n.is_dir
      ? []
      : [
          {
            label: "复制链接",
            icon: <Copy size={14} aria-hidden />,
            onClick: () => {
              setMenu(null);
              const url = new URL(contentUrl(n.id), window.location.origin).href;
              void navigator.clipboard?.writeText(url);
              toast("链接已复制", "info");
            },
          },
        ]),
    {
      label: "删除",
      icon: <Trash2 size={14} aria-hidden />,
      danger: true,
      onClick: () => {
        setMenu(null);
        setDeleting(n);
      },
    },
    {
      label: "详情",
      icon: <Info size={14} aria-hidden />,
      onClick: () => {
        setMenu(null);
        setDetail(n);
      },
    },
  ];

  // 行/卡片右键：打开于指针处（组件内越界翻转）
  const onNodeContextMenu = (e: ReactMouseEvent<HTMLElement>, node: Node) => {
    e.preventDefault();
    setMenu({ node, x: e.clientX, y: e.clientY });
  };

  // 上传文件夹：优先 File System Access 选择器（Chrome/Edge，无浏览器原生确认框），
  // 不支持或用户取消（AbortError）时静默返回；webkitdirectory input 仅作兜底入口
  const pickFolder = () => {
    if (!supportsDirectoryPicker()) {
      folderInput.current?.click();
      return;
    }
    void window.showDirectoryPicker!()
      // 根前缀带上传中文件夹自身名字：path 含 "名字/" 才会逐级 ensure 建出该文件夹
      // （与 webkitdirectory 的 webkitRelativePath 语义一致；不带前缀会导致内容平铺、文件夹不创建）
      .then((handle) => collectDirectory(handle, `${handle.name}/`))
      .then((items) => {
        if (items.length) queue.add(items, dir);
      })
      .catch(() => {});
  };

  // 当前目录 KPI：文件数 / 文件夹数 / 文件总大小（前端过滤前全量统计）
  const dirStats = useMemo(() => {
    let files = 0;
    let dirs = 0;
    let size = 0;
    for (const n of allNodes) {
      if (n.is_dir) dirs++;
      else {
        files++;
        size += n.size ?? 0;
      }
    }
    return { files, dirs, size };
  }, [allNodes]);

  // 空目录 CTA：复用上传入口与新建文件夹
  const emptyDirActions = (
    <div className="flex flex-wrap justify-center gap-2">
      <Button size="sm" onClick={() => fileInput.current?.click()}>
        上传文件
      </Button>
      <Button size="sm" variant="ghost" onClick={pickFolder}>
        上传文件夹
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
        const dt = e.dataTransfer;
        const hasItems = !!dt && ((dt.items?.length ?? 0) > 0 || (dt.files?.length ?? 0) > 0);
        // 目录树递归采集（含文件与文件夹混合拖入），入队后由队列逐级建目录
        void collectUploads(dt)
          .then((items) => {
            if (items.length) queue.add(items, dir);
            else if (hasItems) toast("未发现可上传的文件（空文件夹不会产生上传项）");
          })
          .catch(() => toast("读取拖入内容失败"));
      }}
    >
      {/* KPI 行：存储用量 + 当前目录统计 */}
      <div className="mb-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard className="flex items-center gap-3 p-4">
          <StorageRing pct={pct} />
          <div className="min-w-0">
            <div className="text-xs text-ink-faint">存储用量</div>
            <div className="truncate text-sm font-semibold text-ink" title={`${formatBytes(used)} / ${formatBytes(quota)}`}>
              {me ? `${formatBytes(used)} / ${formatBytes(quota)}` : "-"}
            </div>
          </div>
        </GlassCard>
        <GlassCard className="flex flex-col justify-center gap-1 p-4">
          <div className="text-xs text-ink-faint">当前目录</div>
          <div className="text-sm font-semibold text-ink" data-testid="dir-stats">
            {query.data ? `${dirStats.files} 个文件 · ${dirStats.dirs} 个文件夹` : "-"}
          </div>
          <div className="text-xs text-ink-2">合计 {formatBytes(dirStats.size)}</div>
        </GlassCard>
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
      {/* 文件夹选择（webkitdirectory）：webkitRelativePath 作相对路径入队 */}
      <input
        ref={folderInput}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) {
            queue.add(files.map((file) => ({ file, path: file.webkitRelativePath || file.name })), dir);
          }
          e.target.value = "";
        }}
      />
      {query.data && (
        <div className="mb-3">
          <Breadcrumb crumbs={query.data.breadcrumb} onDropNode={dropMove} />
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
            icon={TriangleAlert}
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
          {/* 工具栏：左侧类型/时间过滤 chips（纯前端过滤），右侧列表/网格分段控件 */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <FilterChips label="类型过滤" options={TYPE_CHIPS} value={typeFilter} onChange={setTypeFilter} />
              <FilterChips label="时间过滤" options={TIME_CHIPS} value={timeFilter} onChange={setTimeFilter} />
            </div>
            <div className="flex items-center gap-2">
              <IconButton label="新建文件夹" onClick={() => setCreating(true)}>
                <FolderPlus size={18} aria-hidden />
              </IconButton>
              <IconButton label="上传文件" onClick={() => fileInput.current?.click()}>
                <Upload size={18} aria-hidden />
              </IconButton>
              <IconButton label="上传文件夹" onClick={pickFolder}>
                <FolderUp size={18} aria-hidden />
              </IconButton>
              <div role="group" aria-label="视图切换" className="inline-flex items-center gap-1 rounded-xl border border-line bg-gray-50 p-1">
                <IconButton label="列表视图" active={view === "list"} aria-pressed={view === "list"} onClick={() => switchView("list")}>
                  <List size={18} aria-hidden />
                </IconButton>
                <IconButton label="网格视图" active={view === "grid"} aria-pressed={view === "grid"} onClick={() => switchView("grid")}>
                  <LayoutGrid size={18} aria-hidden />
                </IconButton>
              </div>
            </div>
          </div>
          <FileList
            nodes={nodes}
            view={view}
            selectable
            selected={selection.selected}
            onToggle={selection.toggle}
            onSelectRange={selection.selectRange}
            onRowFocus={keyboard.focusRow}
            sharedIds={sharedIds}
            focusIndex={keyboard.focusIndex}
            containerRef={listRef}
            onContainerKeyDown={keyboard.onKeyDown}
            onDropMove={dropMove}
            onOpenDir={openDir}
            onOpenFile={setPreview}
            onNodeContextMenu={onNodeContextMenu}
            emptyText={filtered ? "没有符合筛选条件的文件" : "该目录为空"}
            emptyActions={filtered ? undefined : emptyDirActions}
            actions={(n) => (
              <>
                <RowAction label={`分享 ${n.name}`} tone="violet" onClick={() => setSharing(n)}>
                  <Link2 size={14} aria-hidden />
                </RowAction>
                <RowAction label={`重命名 ${n.name}`} onClick={() => setRenaming(n)}>
                  <Pencil size={14} aria-hidden />
                </RowAction>
                <RowAction label={`移动 ${n.name}`} tone="amber" onClick={() => setMoving(n)}>
                  <FolderInput size={14} aria-hidden />
                </RowAction>
                <RowAction label={`删除 ${n.name}`} tone="danger" onClick={() => setDeleting(n)}>
                  <Trash2 size={14} aria-hidden />
                </RowAction>
              </>
            )}
          />
        </GlassCard>
      )}
      <UploadPanel queue={queue} />
      {/* 批量操作条：选中 ≥1 项时浮出，移动端避让底部导航（bottom-20） */}
      {selection.selected.size > 0 && !batchDeleting && !batchMoving && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 sm:bottom-6">
          <div className="flex items-center gap-1.5 rounded-card border border-line bg-white p-2 shadow-card">
            <span className="whitespace-nowrap px-2 text-sm font-medium text-ink">已选 {selection.selected.size} 项</span>
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
            <Button size="sm" variant="ghost" onClick={() => selection.clear()}>
              取消
            </Button>
          </div>
        </div>
      )}
      {preview && <PreviewModal key={preview.id} node={preview} onClose={() => setPreview(null)} />}
      {/* 批量操作进行中进度条（弹窗底部语义）：处理中 i/n */}
      {batchProgress && (
        <div
          data-testid="batch-progress"
          className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 sm:bottom-6"
        >
          <div className="flex items-center gap-2 rounded-card border border-line bg-white px-3 py-2 text-sm text-ink shadow-card">
            <span className="whitespace-nowrap">处理中 {batchProgress.done}/{batchProgress.total}</span>
            <div className="h-1.5 w-24 overflow-hidden rounded bg-gray-100">
              <div
                className="h-full rounded bg-primary transition-[width] duration-200"
                style={{ width: `${Math.round((batchProgress.done / Math.max(batchProgress.total, 1)) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
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
      {batchDeleting && (
        <ConfirmDialog
          open
          title={`删除选中的 ${selection.selected.size} 项`}
          description={`确定删除选中的 ${selection.selected.size} 项？可在回收站恢复。`}
          confirmText="删除"
          danger
          busy={batchBusy}
          extraAction={{ label: "彻底删除", onClick: () => void runBatchDelete(true) }}
          onConfirm={() => void runBatchDelete(false)}
          onCancel={() => setBatchDeleting(false)}
        />
      )}
      {batchMoving && (
        <MoveDialog
          title={`移动 ${selection.selected.size} 项到…`}
          busy={batchBusy}
          onSubmit={(to) => void runBatchMove(to)}
          onCancel={() => setBatchMoving(false)}
        />
      )}
      {/* 详情只读弹窗：名称/大小/类型/修改时间 */}
      {detail && (
        <Dialog open onClose={() => setDetail(null)} title="详情">
          <dl className="space-y-2 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-ink-dim">名称</dt>
              <dd className="break-all text-right font-medium text-ink">{detail.name}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-ink-dim">大小</dt>
              <dd className="tabular-nums text-ink">{formatBytes(detail.is_dir ? null : detail.size)}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-ink-dim">类型</dt>
              <dd className="text-ink">{detail.is_dir ? "文件夹" : (detail.mime ?? "未知")}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-ink-dim">修改时间</dt>
              <dd className="tabular-nums text-ink">{formatDate(detail.updated_at)}</dd>
            </div>
          </dl>
        </Dialog>
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
