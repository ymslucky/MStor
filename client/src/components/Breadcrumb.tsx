import { useEffect, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { Link } from "react-router-dom";
import type { Node } from "../api/types";
import { hasNodeDrag, readNodeDrag } from "../lib/dnd";

interface Props {
  crumbs: Node[];
  /** 拖拽节点到面包屑项：移动到该目录（根面包屑 = 移到根目录） */
  onDropNode?: (nodeId: string, toDirId: string) => void;
}

// 分隔符：chevron › 弱化色
const Chevron = () => (
  <span aria-hidden className="text-ink-faint">›</span>
);

// crumbs 来自 /api/files 的 breadcrumb（不含根）；根固定为「全部文件」指向 /
// 末级即当前目录：text-ink font-medium + aria-current；层级 >4（根 + 4）时中间折叠为「…」
// 点击「…」弹出被折叠层级列表（保持 Link 语义），Esc/点击他处关闭
// 节点拖拽到任意层级（含根）= 移动到该目录，dragover 高亮 2px 主色
export default function Breadcrumb({ crumbs, onDropNode }: Props) {
  const [open, setOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const popRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Element)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 放置目标处理器（dirId=""=根）：仅接受节点拖拽
  const dropProps = (dirId: string) =>
    onDropNode
      ? {
          onDragOver: (e: ReactDragEvent<HTMLAnchorElement>) => {
            if (!hasNodeDrag(e.dataTransfer)) return;
            e.preventDefault();
            setDropTarget((cur) => (cur === dirId ? cur : dirId));
          },
          onDragLeave: () => setDropTarget((cur) => (cur === dirId ? null : cur)),
          onDrop: (e: ReactDragEvent<HTMLAnchorElement>) => {
            const payload = readNodeDrag(e.dataTransfer);
            setDropTarget(null);
            if (!payload || payload.id === dirId) return;
            e.preventDefault();
            e.stopPropagation();
            onDropNode(payload.id, dirId);
          },
        }
      : {};

  const highlight = (dirId: string) => (dropTarget === dirId ? "rounded bg-primary-soft ring-2 ring-primary" : "");

  const currentId = crumbs[crumbs.length - 1]?.id;
  const collapsed = crumbs.length > 3; // 根 + crumbs > 4 ⇔ crumbs > 3
  const hidden = collapsed ? crumbs.slice(0, crumbs.length - 2) : [];
  const tail = collapsed ? crumbs.slice(crumbs.length - 2) : crumbs;

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="面包屑">
      <Link to="/" {...dropProps("")} className={`text-ink-dim hover:underline ${highlight("")}`}>全部文件</Link>
      {collapsed && (
        <span ref={popRef} className="relative flex items-center gap-1">
          <Chevron />
          <button
            type="button"
            aria-label="更多层级"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="rounded px-1 leading-none text-ink-dim hover:bg-gray-50 hover:text-ink"
          >
            …
          </button>
          {open && (
            <div className="absolute top-full left-0 z-40 mt-1 min-w-[8rem] rounded-xl border border-line bg-white py-1 shadow-card">
              {hidden.map((c) => (
                <Link
                  key={c.id}
                  to={`/?dir=${c.id}`}
                  className="block px-3 py-2 text-ink-dim hover:bg-gray-50 hover:text-ink"
                  onClick={() => setOpen(false)}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}
        </span>
      )}
      {(collapsed ? tail : crumbs).map((c) => {
        const current = c.id === currentId;
        return (
          <span key={c.id} className="flex items-center gap-1">
            <Chevron />
            <Link
              to={`/?dir=${c.id}`}
              aria-current={current ? "page" : undefined}
              {...dropProps(c.id)}
              className={current ? `font-medium text-ink hover:underline ${highlight(c.id)}` : `text-ink-dim hover:underline ${highlight(c.id)}`}
            >
              {c.name}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
