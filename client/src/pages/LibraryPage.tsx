import { useQuery } from "@tanstack/react-query";
import { Clock, Star, Tag as TagIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { listFavorites, listRecent, listTags, listTagged } from "../api/library";
import type { TagRow } from "../api/library";
import { contentUrl } from "../api/nodes";
import type { Node } from "../api/types";
import { EmptyState, GlassCard, Pill, Skeleton } from "../components/ui";
import { NodeIcon } from "../components/NodeIcon";
import { formatBytes, formatDate } from "../lib/format";

type Kind = "favorites" | "recent" | "tags";

const COPY: Record<Kind, { title: string; desc: string; icon: typeof Star; empty: string }> = {
  favorites: { title: "收藏", desc: "你标记为重要的文件与文件夹", icon: Star, empty: "还没有收藏，在文件右键菜单里可以加入收藏" },
  recent: { title: "最近", desc: "按最近访问时间排序", icon: Clock, empty: "最近没有访问记录" },
  tags: { title: "标签", desc: "按标签归类查看", icon: TagIcon, empty: "还没有创建标签" },
};

function NodeRow({ node }: { node: Node }) {
  const href = node.is_dir ? `/?dir=${node.id}` : contentUrl(node.id);
  return (
    <Link
      to={href}
      className="flex items-center gap-3 rounded-card px-3 py-2 transition-colors hover:bg-primary-soft/50"
    >
      <NodeIcon node={node} size={18} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{node.name}</span>
      <span className="num shrink-0 text-xs text-ink-3">{node.is_dir ? "文件夹" : formatBytes(node.size)}</span>
      <span className="num hidden shrink-0 text-xs text-ink-3 sm:block">{formatDate(node.updated_at)}</span>
    </Link>
  );
}

/** 收藏 / 最近 / 标签 三个库视图（服务端 /api/library/* 已就绪） */
export default function LibraryPage({ kind }: { kind: Kind }) {
  const [params, setParams] = useSearchParams();
  const tagId = params.get("tag");
  const meta = COPY[kind];

  const query = useQuery({
    queryKey: ["library", kind, tagId],
    queryFn: () =>
      kind === "favorites"
        ? listFavorites()
        : kind === "recent"
          ? listRecent()
          : tagId
            ? listTagged(tagId)
            : listTags().then((r: { tags: TagRow[] }) => ({ nodes: [] as Node[], tags: r.tags })),
  });

  const tags = (query.data as { tags?: { id: string; name: string; color?: string | null }[] } | undefined)?.tags;
  const nodes = (query.data as { nodes?: Node[] } | undefined)?.nodes ?? [];

  return (
    <div className="md:pb-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold text-ink">{meta.title}</h1>
        <p className="text-2xs text-ink-3">{meta.desc}</p>
      </header>

      {kind === "tags" && tags && tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Pill tone={tagId ? "neutral" : "accent"}>
            <button type="button" onClick={() => setParams({})} className="px-1">
              全部标签
            </button>
          </Pill>
          {tags.map((t) => (
            <Pill key={t.id} tone={tagId === t.id ? "accent" : "neutral"}>
              <button type="button" onClick={() => setParams({ tag: t.id })} className="px-1">
                {t.name}
              </button>
            </Pill>
          ))}
        </div>
      )}

      <GlassCard className="p-2">
        {query.isPending ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : nodes.length === 0 ? (
          <EmptyState icon={meta.icon} title={tagId ? "该标签下暂无文件" : meta.empty} />
        ) : (
          <div className="divide-y divide-line">
            {nodes.map((n) => (
              <NodeRow key={n.id} node={n} />
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
