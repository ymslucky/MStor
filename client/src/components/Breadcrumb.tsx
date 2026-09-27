import { Link } from "react-router-dom";
import type { Node } from "../api/types";

// crumbs 来自 /api/files 的 breadcrumb（不含根）；根固定为「全部文件」指向 /
// 末级即当前目录：text-ink font-medium，其余次级色，分隔符弱化
export default function Breadcrumb({ crumbs }: { crumbs: Node[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="面包屑">
      <Link to="/" className="text-ink-dim hover:underline">全部文件</Link>
      {crumbs.map((c, i) => {
        const current = i === crumbs.length - 1;
        return (
          <span key={c.id} className="flex items-center gap-1">
            <span aria-hidden className="text-ink-faint">/</span>
            <Link
              to={`/?dir=${c.id}`}
              aria-current={current ? "page" : undefined}
              className={current ? "font-medium text-ink hover:underline" : "text-ink-dim hover:underline"}
            >
              {c.name}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
