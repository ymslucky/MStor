import { FolderPlus, FolderUp, LayoutGrid, List, Upload } from "lucide-react";
import type { TimeFilter, TypeFilter } from "../lib/fileFilters";
import { TimeFilterChips, TypeFilterChips } from "./FileFilters";
import { Button, IconButton } from "./ui";

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

/** 文件控制舱第二行：筛选、创建和主上传动作保持在一个视觉组内。 */
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <TypeFilterChips value={typeFilter} onChange={onTypeFilter} />
        <TimeFilterChips value={timeFilter} onChange={onTimeFilter} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="hidden sm:inline-flex">
          <IconButton label="上传文件夹" onClick={onUploadFolder}>
            <FolderUp size={17} aria-hidden />
          </IconButton>
        </span>
        <Button size="sm" variant="ghost" onClick={onCreateDir}>
          <FolderPlus size={15} aria-hidden />
          新建文件夹
        </Button>
        <Button size="sm" aria-label="上传文件" onClick={onUploadFiles}>
          <Upload size={15} aria-hidden />
          上传
        </Button>
        <div role="group" aria-label="视图切换" className="ml-1 inline-flex items-center gap-0.5 rounded-btn border border-line bg-bg-sub p-0.5">
          <IconButton label="列表视图" active={view === "list"} aria-pressed={view === "list"} onClick={() => onView("list")}>
            <List size={17} aria-hidden />
          </IconButton>
          <IconButton label="网格视图" active={view === "grid"} aria-pressed={view === "grid"} onClick={() => onView("grid")}>
            <LayoutGrid size={17} aria-hidden />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
