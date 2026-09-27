import { Link } from "react-router-dom";
import type { Node } from "../api/types";

// crumbs 来自 /api/files 的 breadcrumb（不含根）；根固定为「全部文件」指向 /
export default function Breadcrumb({ crumbs }: { crumbs: Node[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-600" aria-label="面包屑">
      <Link to="/" className="hover:underline">全部文件</Link>
      {crumbs.map((c) => (
        <span key={c.id} className="flex items-center gap-1">
          <span className="text-slate-300">/</span>
          <Link to={`/?dir=${c.id}`} className="hover:underline">{c.name}</Link>
        </span>
      ))}
    </nav>
  );
}
