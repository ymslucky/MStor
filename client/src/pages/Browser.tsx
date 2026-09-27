import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Breadcrumb from "../components/Breadcrumb";
import FileList from "../components/FileList";
import NameDialog from "../components/NameDialog";
import { useFiles } from "../hooks/useFiles";

export default function Browser() {
  const [params, setParams] = useSearchParams();
  const dir = params.get("dir") ?? "";
  const { query, mkDir } = useFiles(dir);
  const [creating, setCreating] = useState(false);

  const openDir = (id: string) => setParams(id ? { dir: id } : {});

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
        <FileList nodes={query.data.nodes} onOpenDir={openDir} onOpenFile={() => {}} />
      )}
      {creating && (
        <NameDialog
          title="新建文件夹"
          busy={mkDir.isPending}
          onSubmit={(name) => mkDir.mutate(name, { onSuccess: () => setCreating(false) })}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  );
}
