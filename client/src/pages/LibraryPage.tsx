import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Clock, Star, Tag as TagIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { createTag, deleteTag, listFavorites, listRecent, listTags, listTagged } from "../api/library";
import type { TagRow } from "../api/library";
import { contentUrl } from "../api/nodes";
import type { Node } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { PageHeader } from "../components/layout/PageHeader";
import { toast } from "../components/Toaster";
import { Button, ConfirmDialog, EmptyState, GlassCard, Input, Pill } from "../components/ui";
import { NodeIcon } from "../components/NodeIcon";
import { queryKeys } from "../lib/queryKeys";
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
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState("");
  const [deletingTag, setDeletingTag] = useState(false);
  const invalidateTags = () => queryClient.invalidateQueries({ queryKey: ["library", "tags"] });

  const create = useMutation({
    mutationFn: (name: string) => createTag(name),
    onSuccess: () => {
      setNewTag("");
      toast("标签已创建", "info");
      void invalidateTags();
    },
    onError: (e) => toast(e instanceof Error ? e.message : "创建标签失败"),
  });
  const removeTag = useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => {
      setDeletingTag(false);
      setParams({});
      toast("标签已删除", "info");
      void invalidateTags();
    },
    onError: (e) => toast(e instanceof Error ? e.message : "删除标签失败"),
  });

  const query = useQuery({
    meta: { silent: true },
    queryKey:
      kind === "favorites"
        ? queryKeys.favorites
        : kind === "recent"
          ? queryKeys.recent
          : queryKeys.library("tags", tagId),
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
      <PageHeader title={meta.title} description={meta.desc} />

      {kind === "tags" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newTag.trim();
              if (name && !create.isPending) create.mutate(name);
            }}
          >
            <Input
              aria-label="新标签名"
              placeholder="新标签名…"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              maxLength={32}
              className="h-8 w-40 text-xs"
            />
            <Button type="submit" size="sm" disabled={!newTag.trim() || create.isPending}>
              新建标签
            </Button>
          </form>
          {tagId && (
            <Button size="sm" variant="danger" onClick={() => setDeletingTag(true)}>
              删除该标签
            </Button>
          )}
        </div>
      )}

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
        <AsyncState query={query} skeletonRows={4} skeletonClassName="p-2">
          {nodes.length === 0 ? (
            <EmptyState icon={meta.icon} title={tagId ? "该标签下暂无文件" : meta.empty} />
          ) : (
            <div className="divide-y divide-line">
              {nodes.map((n) => (
                <NodeRow key={n.id} node={n} />
              ))}
            </div>
          )}
        </AsyncState>
      </GlassCard>

      <ConfirmDialog
        open={deletingTag}
        danger
        title="删除标签"
        description="删除后该标签会从所有文件上移除，文件本身不受影响。确定继续吗？"
        confirmText="删除"
        busy={removeTag.isPending}
        onConfirm={() => {
          if (tagId) removeTag.mutate(tagId);
        }}
        onCancel={() => setDeletingTag(false)}
      />
    </div>
  );
}
