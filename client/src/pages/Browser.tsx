import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, MoreHorizontal, TriangleAlert } from "lucide-react";
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
import { ConflictDialog } from "../components/ConflictDialog";
import { useBrowserUpload } from "../hooks/useBrowserUpload";
import { PullToRefreshIndicator } from "../components/PullToRefreshIndicator";
import { useBrowserQuery } from "../hooks/useBrowserQuery";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { BrowserDialogs } from "../components/BrowserDialogs";
import { NodeRowActions } from "../components/NodeRowActions";
import { BatchBar } from "../components/BatchBar";
import { BatchTagDialog } from "../components/BatchTagDialog";
import { Button, EmptyState, GlassCard, Skeleton } from "../components/ui";
import { useBatchOps } from "../hooks/useBatchOps";
import { useBrowserDialogs } from "../hooks/useBrowserDialogs";
import { useNodeActions } from "../hooks/useNodeActions";
import { useFiles } from "../hooks/useFiles";
import { useFileSelection } from "../hooks/useFileSelection";
import { useKeyboardNav } from "../hooks/useKeyboardNav";
import { useUploadQueueActions } from "../hooks/UploadQueueProvider";
import { collectDirectory, supportsDirectoryPicker } from "../lib/dirscan";
import { recordView } from "../api/library";
import { downloadMany, triggerDownload } from "../lib/download";
import { DETAIL_PANE_MEDIA_QUERY } from "../lib/constants";
import { useDropUpload } from "../hooks/useDropUpload";
import { DropOverlay } from "../components/DropOverlay";
import { contentUrl } from "../api/nodes";
import { RowAction } from "../components/RowAction";
import { filterNodes } from "../lib/fileFilters";
import type { TimeFilter, TypeFilter } from "../lib/fileFilters";
import { STORAGE_KEYS, getString, setString } from "../lib/storage";

export default function Browser() {
  const [params, setParams] = useSearchParams();
  const dir = params.get("dir") ?? "";
  const { query, mkDir, rename, move, copy, remove, undo, undoId, undoKind, clearUndo } = useFiles(dir);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 只订阅稳定的 actions：上传进度不再触发 Browser 整页重渲染
  const { add } = useUploadQueueActions();
  const dialogs = useBrowserDialogs();
  const { preview, setPreview, detail, setDetail, setCreating, setRenaming, setMoving, setCopying, setSharing, setDeleting, setTagging } = dialogs;
  // 视图偏好持久化，缺省 list
  const [view, setView] = useState<"list" | "grid">(() => (getString(STORAGE_KEYS.view) === "grid" ? "grid" : "list"));
  // 右键菜单：当前节点 + 指针位置
  const [menu, setMenu] = useState<{ node: Node; x: number; y: number } | null>(null);
  const [batchTagging, setBatchTagging] = useState(false);
  // 前端过滤 chips
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  // 命令面板「新建文件夹」：通过 URL 参数跨页触发创建弹窗，随后清理参数避免刷新重开
  useEffect(() => {
    if (!params.get("newFolder")) return;
    setCreating(true);
    const next = new URLSearchParams(params);
    next.delete("newFolder");
    setParams(next, { replace: true });
  }, [params, setParams, setCreating]);

  const openDir = (id: string) => {
    // 进入目录 = 一次访问，供「最近」列表使用（失败不影响导航）
    if (id) void recordView(id).catch(() => {});
    setParams(id ? { dir: id } : {});
  };

  // 过滤后的当前目录列表（键盘导航/选择/渲染都以可见列表为准）
  const { allNodes, favIds, pull, sharedIds, toggleFavorite } = useBrowserQuery(query);
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
    onClearSelection: selection.clear,
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

  // 批量下载：仅文件，逐个错峰触发（策略在 lib/download）
  const batchDownload = () => {
    const ids = allNodes.filter((n) => selection.selected.has(n.id) && !n.is_dir).map((n) => n.id);
    downloadMany(ids);
  };


  // 详情只有一种呈现：xl+ = 右侧布局列，更窄 = 弹窗（1024–1279 内联详情会把固定列挤出视口）
  const isDesktop = useMediaQuery(DETAIL_PANE_MEDIA_QUERY);


  const upload = useBrowserUpload({
    dir,
    nodes: allNodes,
    add,
    purge: purgeNow,
  });
  const { enqueue } = upload;
  // 拖拽与文件选择走同一套同名冲突策略；此前拖拽直接 add，会绕过冲突对话框
  const drop = useDropUpload({ enqueue: (items) => upload.enqueue(items) });

  const selectedNodes = allNodes.filter((n) => selection.selected.has(n.id));
  const hasFileSelected = selectedNodes.some((n) => !n.is_dir);

  // 单文件下载：临时 <a> 触发 content?dl=1
  const downloadNode = (n: Node) => triggerDownload(n.id);

  // 拖拽移动（文件夹行/面包屑 drop）：复用既有 moveNode
  const dropMove = (id: string, to: string) => {
    if (!id) return;
    // 拖回当前目录/当前文件夹自身：不做移动，避免无意义请求与“已移动”撤销条
    const source = allNodes.find((n) => n.id === id);
    const targetParent = to || query.data?.rootId;
    if (source && targetParent && source.parent_id === targetParent) return;
    move.mutate({ id, to });
  };


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
    onTag: setTagging,
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
        if (items.length) add(items, dir);
      })
      .catch(() => {});
  };

  // 网格卡片操作组：只放「下载 + 更多」，避免手机 2 列卡片塞 6 个按钮超宽被 overflow-hidden 裁掉；
  // 「更多」复用列表右键菜单的同一份 menuItemsFor
  const gridActionsFor = (n: Node) => (
    <>
      {!n.is_dir && (
        <a
          href={contentUrl(n.id, true)}
          aria-label={`下载 ${n.name}`}
          title={`下载 ${n.name}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-primary-text transition-colors hover:bg-primary-soft"
        >
          <Download size={14} aria-hidden />
        </a>
      )}
      <RowAction
        label={`更多操作 ${n.name}`}
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setMenu({ node: n, x: rect.right, y: rect.bottom });
        }}
      >
        <MoreHorizontal size={14} aria-hidden />
      </RowAction>
    </>
  );

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
    <div data-testid="drop-zone" className="md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden" {...drop.dropHandlers}>
      {/* 页面标题（视觉由移动端 TopBar 承担，读屏仍需要一个 h1） */}
      <h1 className="sr-only">文件</h1>
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
            add(files.map((file) => ({ file, path: file.webkitRelativePath || file.name })), dir);
          }
          e.target.value = "";
        }}
      />
      {query.data && (
        <div className="mb-3 flex min-w-0 items-center gap-3">
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
        />
      )}
      {query.data && (
        <GlassCard className="px-3 pt-3 pb-0 sm:px-4 sm:pt-4 md:flex md:min-h-0 md:flex-1 md:flex-col">
          <div className="md:flex md:min-h-0 md:flex-1 md:gap-4">
            <div className="md:flex md:min-h-0 md:min-w-0 md:flex-1 md:flex-col md:overflow-hidden">
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
            gridActions={gridActionsFor}
            onMoreMenu={(node, rect) => setMenu({ node, x: rect.right, y: rect.bottom })}
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
            </div>
            {detail && isDesktop && (
              <DetailPane
                node={detail}
                onClose={() => setDetail(null)}
                onDownload={downloadNode}
                onShare={setSharing}
                onRename={setRenaming}
                onMove={setMoving}
                onDelete={setDeleting}
                onTag={setTagging}
              />
            )}
          </div>
        </GlassCard>
      )}
      <BatchBar
        count={selection.selected.size}
        hasFileSelected={hasFileSelected}
        onDownload={batchDownload}
        onMove={() => setBatchMoving(true)}
        onTag={() => setBatchTagging(true)}
        onDelete={() => setBatchDeleting(true)}
        onClear={selection.clear}
        hidden={batchDeleting || batchMoving || batchTagging}
      />
      {batchTagging && (
        <BatchTagDialog
          nodeIds={[...selection.selected]}
          onClose={() => setBatchTagging(false)}
          onDone={() => {
            setBatchTagging(false);
            selection.clear();
          }}
        />
      )}
            {preview && <PreviewModal key={preview.id} node={preview} onClose={() => setPreview(null)} />}
      {batchProgress && <BatchProgress done={batchProgress.done} total={batchProgress.total} />}
      {upload.conflicts && (
        <ConflictDialog
          names={upload.conflicts.names}
          remember={upload.remember}
          onRememberChange={upload.setRemember}
          onDecide={upload.decide}
          onCancel={upload.cancel}
        />
      )}
      <PullToRefreshIndicator pull={pull.pull} ready={pull.ready} refreshing={pull.refreshing} />
      {undoId && (
        <UndoSnackbar
          key={undoId}
          message={undoKind === "rename" ? "已重命名，可在 10 秒内撤销" : "已移动，可在 10 秒内撤销"}
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
      />      {/* 窄屏详情：弹窗形态（桌面用右侧详情栏，二选一，不并存） */}
      {detail && !isDesktop && <NodeDetailDialog node={detail} onClose={() => setDetail(null)} />}
      {/* 拖拽全屏覆盖层：drop/离开窗口后关闭（计数法归零） */}
      <DropOverlay open={drop.showOverlay} />
      {/* 右键菜单（移动端无右键，沿用行内按钮） */}
      {menu && <ContextMenu open x={menu.x} y={menu.y} items={menuItemsFor(menu.node)} onClose={() => setMenu(null)} />}
    </div>
  );
}