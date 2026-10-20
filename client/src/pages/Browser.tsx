import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { listShares } from "../api/shares";
import { addFavorite, listFavorites, removeFavorite } from "../api/library";
import type { Node } from "../api/types";
import Breadcrumb from "../components/Breadcrumb";
import ContextMenu from "../components/ContextMenu";
import FileList from "../components/FileList";
import NodeDetailDialog from "../components/NodeDetailDialog";
import { DetailPane } from "../components/DetailPane";
import PreviewModal from "../components/PreviewModal";
import { BrowserToolbar } from "../components/BrowserToolbar";
import { BatchProgress } from "../components/BatchProgress";
import { UndoSnackbar } from "../components/UndoSnackbar";
import { ConflictDialog, uniqueName } from "../components/ConflictDialog";
import type { ConflictPolicy } from "../components/ConflictDialog";
import { BrowserDialogs } from "../components/BrowserDialogs";
import { NodeRowActions } from "../components/NodeRowActions";
import { BatchBar } from "../components/BatchBar";
import UploadPanel from "../components/UploadPanel";
import { toast } from "../components/Toaster";
import { Button, EmptyState, GlassCard, Skeleton } from "../components/ui";
import { useBatchOps } from "../hooks/useBatchOps";
import { useBrowserDialogs } from "../hooks/useBrowserDialogs";
import { useNodeActions } from "../hooks/useNodeActions";
import { useFiles } from "../hooks/useFiles";
import { useFileSelection } from "../hooks/useFileSelection";
import { useKeyboardNav } from "../hooks/useKeyboardNav";
import { useUploadQueueContext } from "../hooks/UploadQueueProvider";
import { collectDirectory, collectUploads, supportsDirectoryPicker } from "../lib/dirscan";
import { triggerDownload } from "../lib/download";
import { filterNodes } from "../lib/fileFilters";
import type { TimeFilter, TypeFilter } from "../lib/fileFilters";
import { STORAGE_KEYS, getString, setString } from "../lib/storage";

export default function Browser() {
  const [params, setParams] = useSearchParams();
  const dir = params.get("dir") ?? "";
  const { query, mkDir, rename, move, copy, remove, undo, undoId, clearUndo } = useFiles(dir);
  const sharesQuery = useQuery({ queryKey: ["shares"], queryFn: listShares });
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const queue = useUploadQueueContext();
  const dialogs = useBrowserDialogs();
  const { preview, setPreview, detail, setDetail, setCreating, setRenaming, setMoving, setCopying, setSharing, setDeleting } = dialogs;
  // 视图偏好持久化，缺省 list
  const [view, setView] = useState<"list" | "grid">(() => (getString(STORAGE_KEYS.view) === "grid" ? "grid" : "list"));
  // 拖拽上传：dragenter/leave 计数法防子元素闪烁，>0 时显示全屏覆盖层
  const [dragDepth, setDragDepth] = useState(0);
  // 右键菜单：当前节点 + 指针位置
  const [menu, setMenu] = useState<{ node: Node; x: number; y: number } | null>(null);
  // 前端过滤 chips
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const openDir = (id: string) => setParams(id ? { dir: id } : {});

  // 过滤后的当前目录列表（键盘导航/选择/渲染都以可见列表为准）
  const allNodes = useMemo(() => query.data?.nodes ?? [], [query.data]);
  const filtered = typeFilter !== "all" || timeFilter !== "all";
  const nodes = useMemo(() => filterNodes(allNodes, typeFilter, timeFilter), [allNodes, typeFilter, timeFilter]);

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
    setString(STORAGE_KEYS.view, v);
  };

  // 批量操作（删除/移动/彻底删除）：逻辑见 hooks/useBatchOps
  const {
    batchDeleting,
    setBatchDeleting,
    batchMoving,
    setBatchMoving,
    batchBusy,
    deleteBusy,
    batchProgress,
    runBatchDelete,
    runBatchMove,
    purgeNow,
  } = useBatchOps({ selectedIds: selection.selected, onClear: selection.clear, onPurged: () => setDeleting(null) });

  // 批量下载：仅文件，300ms 间隔逐个触发（避免浏览器拦截）
  const batchDownload = () => {
    const files = allNodes.filter((n) => selection.selected.has(n.id) && !n.is_dir);
    files.forEach((n, i) => window.setTimeout(() => triggerDownload(n.id), i * 300));
  };

  // 同名冲突：入队前比对当前目录名称；记住的选择写 localStorage（mstor_upload_conflict）
  const CONFLICT_KEY = "mstor_upload_conflict";
  const [conflicts, setConflicts] = useState<{ files: File[]; names: string[] } | null>(null);
  const [rememberConflict, setRememberConflict] = useState(() => getString(CONFLICT_KEY) !== "");

  const takenNames = new Set(allNodes.map((n) => n.name));

  // 收藏：行内星标切换（服务端 PUT/DELETE 幂等），成功后刷新收藏集合
  const favorites = useQuery({ queryKey: ["favorites"], queryFn: listFavorites });
  const favIds = new Set((favorites.data?.nodes ?? []).map((n) => n.id));
  const toggleFavorite = (n: Node) => {
    const on = favIds.has(n.id);
    const action = on ? removeFavorite(n.id) : addFavorite(n.id);
    void action
      .then(() => {
        toast(on ? "已取消收藏" : "已收藏", "info");
        return favorites.refetch();
      })
      .catch((e) => toast(e instanceof Error ? e.message : "操作失败"));
  };

  const applyPolicy = (policy: ConflictPolicy, files: File[]) => {
    if (policy === "skip") {
      queue.add(files.filter((f) => !takenNames.has(f.name)), dir);
      return;
    }
    if (policy === "keepBoth") {
      const used = new Set(takenNames);
      const renamed = files.map((f) => {
        if (!takenNames.has(f.name)) return f;
        const name = uniqueName(f.name, used);
        used.add(name);
        return new File([f], name, { type: f.type });
      });
      queue.add(renamed, dir);
      return;
    }
    // 覆盖：先彻底删除同名节点（软删会占着唯一名），再入队
    const ids = allNodes.filter((n) => files.some((f) => f.name === n.name)).map((n) => n.id);
    void Promise.all(ids.map((id) => purgeNow(id))).then(() => queue.add(files, dir));
  };

  const enqueue = (items: (File | { file: File; path?: string })[]) => {
    const plain = items.filter((i): i is File => i instanceof File);
    const withPath = items.filter((i) => !(i instanceof File));
    if (withPath.length) queue.add(withPath, dir);
    if (!plain.length) return;
    const dup = plain.filter((f) => takenNames.has(f.name)).map((f) => f.name);
    if (!dup.length) {
      queue.add(plain, dir);
      return;
    }
    const remembered = getString(CONFLICT_KEY);
    if (remembered === "keepBoth" || remembered === "overwrite" || remembered === "skip") {
      applyPolicy(remembered, plain);
      return;
    }
    setConflicts({ files: plain, names: dup });
  };

  const selectedNodes = allNodes.filter((n) => selection.selected.has(n.id));
  const hasFileSelected = selectedNodes.some((n) => !n.is_dir);

  // 单文件下载：临时 <a> 触发 content?dl=1
  const downloadNode = (n: Node) => triggerDownload(n.id);

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

  const menuItemsFor = useNodeActions({
    closeMenu: () => setMenu(null),
    onOpenDir: openDir,
    onPreview: setPreview,
    onDownload: downloadNode,
    onShare: setSharing,
    onRename: setRenaming,
    onMove: setMoving,
    onCopy: setCopying,
    onDelete: setDeleting,
    onDetail: setDetail,
  });
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
            if (items.length) enqueue(items);
            else if (hasItems) toast("未发现可上传的文件（空文件夹不会产生上传项）");
          })
          .catch(() => toast("读取拖入内容失败"));
      }}
    >
      {/* KPI 行：存储用量 + 当前目录统计 */}
      {/* KPI 卡片已移除：存储用量在底部状态栏，目录统计交给列表头 */}
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) enqueue(Array.from(e.target.files));
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
              <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-bg-sub/50 p-3">
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
          <BrowserToolbar
            typeFilter={typeFilter}
            timeFilter={timeFilter}
            onTypeFilter={setTypeFilter}
            onTimeFilter={setTimeFilter}
            view={view}
            onView={switchView}
            onCreateDir={() => setCreating(true)}
            onUploadFiles={() => fileInput.current?.click()}
            onUploadFolder={pickFolder}
          />          <FileList
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
              <NodeRowActions
                node={n}
                favorited={favIds.has(n.id)}
                onToggleFavorite={toggleFavorite}
                onShare={setSharing}
                onRename={setRenaming}
                onMove={setMoving}
                onDelete={setDeleting}
              />
            )}
          />
        </GlassCard>
      )}
      <UploadPanel queue={queue} />
      <BatchBar
        count={selection.selected.size}
        hasFileSelected={hasFileSelected}
        onDownload={batchDownload}
        onMove={() => setBatchMoving(true)}
        onDelete={() => setBatchDeleting(true)}
        onClear={selection.clear}
        hidden={batchDeleting || batchMoving}
      />
            {preview && <PreviewModal key={preview.id} node={preview} onClose={() => setPreview(null)} />}
      {batchProgress && <BatchProgress done={batchProgress.done} total={batchProgress.total} />}
      {conflicts && (
        <ConflictDialog
          names={conflicts.names}
          remember={rememberConflict}
          onRememberChange={setRememberConflict}
          onDecide={(policy) => {
            if (rememberConflict) setString(CONFLICT_KEY, policy);
            const files = conflicts.files;
            setConflicts(null);
            applyPolicy(policy, files);
          }}
          onCancel={() => setConflicts(null)}
        />
      )}
      {undoId && (
        <UndoSnackbar
          message="已移动，可在 10 秒内撤销"
          onUndo={() => undo.mutate(undoId)}
          onClose={clearUndo}
        />
      )}
      <BrowserDialogs
        dialogs={dialogs}
        ops={{
          mkDir,
          rename,
          remove,
          move,
          copy,
          purgeNow,
          runBatchDelete,
          runBatchMove,
          deleteBusy,
          batchBusy,
          selectedCount: selection.selected.size,
          batchDeleting,
          setBatchDeleting,
          batchMoving,
          setBatchMoving,
        }}
      />      {/* 详情只读弹窗：名称/大小/类型/修改时间 */}
      {detail && (
        <>
          <div className="hidden lg:block">
            <DetailPane
              node={detail}
              onClose={() => setDetail(null)}
              onDownload={downloadNode}
              onShare={setSharing}
              onRename={setRenaming}
              onMove={setMoving}
              onDelete={setDeleting}
            />
          </div>
          <div className="lg:hidden">
            <NodeDetailDialog node={detail} onClose={() => setDetail(null)} />
          </div>
        </>
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