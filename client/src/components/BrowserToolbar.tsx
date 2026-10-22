import { FolderPlus, FolderUp, LayoutGrid, List, Upload } from "lucide-react";
import type { TimeFilter, TypeFilter } from "../lib/fileFilters";
import { TimeFilterChips, TypeFilterChips } from "./FileFilters";
import { IconButton } from "./ui";

interface Props {
  typeFilter: TypeFilter;
  timeFilter: TimeFilter;
  onTypeFilter: (v: TypeFilter) => void;
  onTimeFilter: (v: TimeFilter) => void;
  view: "list" | "grid";
  onView: (v: "list" | "grid") => void;
  onCreateDir: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
}

/** 文件页工具条：左侧前端过滤 chips，右侧新建/上传/视图切换；下方可挂批量操作条 */
export function BrowserToolbar({
  typeFilter,
  timeFilter,
  onTypeFilter,
  onTimeFilter,
  view,
  onView,
  onCreateDir,
  onUploadFiles,
  onUploadFolder,
}: Props) {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TypeFilterChips value={typeFilter} onChange={onTypeFilter} />
          <TimeFilterChips value={timeFilter} onChange={onTimeFilter} />
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="新建文件夹" onClick={onCreateDir}>
            <FolderPlus size={18} aria-hidden />
          </IconButton>
          <IconButton label="上传文件" onClick={onUploadFiles}>
            <Upload size={18} aria-hidden />
          </IconButton>
          <IconButton label="上传文件夹" onClick={onUploadFolder}>
            <FolderUp size={18} aria-hidden />
          </IconButton>
          <div role="group" aria-label="视图切换" className="inline-flex items-center gap-1 rounded-xl border border-line bg-bg-sub p-1">
            <IconButton label="列表视图" active={view === "list"} aria-pressed={view === "list"} onClick={() => onView("list")}>
              <List size={18} aria-hidden />
            </IconButton>
            <IconButton label="网格视图" active={view === "grid"} aria-pressed={view === "grid"} onClick={() => onView("grid")}>
              <LayoutGrid size={18} aria-hidden />
            </IconButton>
          </div>
        </div>
      </div>
    </>
  );
}
