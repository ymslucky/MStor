import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Clock, Star, Tag as TagIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { createTag, deleteTag, listFavorites, listRecent, listTags, listTagged, updateTag } from "../api/library";
import { contentUrl } from "../api/nodes";
import type { Node } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { PageHeader } from "../components/layout/PageHeader";
import { toast } from "../components/Toaster";
import { Button, ConfirmDialog, Dialog, EmptyState, GlassCard, Input, Pill } from "../components/ui";
import { NodeIcon } from "../components/NodeIcon";
import { queryKeys } from "../lib/queryKeys";
import { formatBytes, formatDate } from "../lib/format";
import { DEFAULT_TAG_COLOR, TAG_COLORS, tagDotColor } from "../lib/tagColors";

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
  const [newTagColor, setNewTagColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [deletingTag, setDeletingTag] = useState(false);
  const [renamingTag, setRenamingTag] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const invalidateTags = () => queryClient.invalidateQueries({ queryKey: ["library", "tags"] });

  const create = useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => createTag(name, color),
    onSuccess: () => {
      setNewTag("");
      setNewTagColor(DEFAULT_TAG_COLOR);
      toast("标签已创建", "info");
      void invalidateTags();
    },
    onError: (e) => toast(e instanceof Error ? e.message : "创建标签失败"),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; color?: string | null }) => updateTag(id, body),
    onSuccess: () => {
      setRenamingTag(false);
      toast("标签已更新", "info");
      void invalidateTags();
    },
    onError: (e) => toast(e instanceof Error ? e.message : "更新标签失败"),
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

  // 标签列表独立查询：选中某个标签时仍需保留可切换的标签 pills
  const tagsQuery = useQuery({
    queryKey: queryKeys.library("tags", null),
    queryFn: listTags,
    enabled: kind === "tags",
    meta: { silent: true },
  });
  const nodesQuery = useQuery({
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
            : Promise.resolve({ nodes: [] as Node[] }),
    // 标签页未选标签时不请求节点；收藏/最近始终请求
    enabled: kind !== "tags" || !!tagId,
    meta: { silent: true },
  });

  const tags = tagsQuery.data?.tags;
  const selectedTag = tags?.find((t) => t.id === tagId);
  const nodes = nodesQuery.data?.nodes ?? [];

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
              if (name && !create.isPending) create.mutate({ name, color: newTagColor });
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
            <select
              aria-label="标签颜色"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              className="h-8 rounded-btn border border-line bg-surface-1 px-2 text-xs text-ink"
            >
              {TAG_COLORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" disabled={!newTag.trim() || create.isPending}>
              新建标签
            </Button>
          </form>
          {tagId && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-ink-3">
                颜色
                <select
                  aria-label="修改标签颜色"
                  value={selectedTag?.color ?? ""}
                  disabled={update.isPending}
                  onChange={(e) => {
                    if (tagId) update.mutate({ id: tagId, color: e.target.value || null });
                  }}
                  className="h-8 rounded-btn border border-line bg-surface-1 px-2 text-xs text-ink"
                >
                  <option value="">无</option>
                  {TAG_COLORS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!selectedTag) return;
                  setRenameValue(selectedTag.name);
                  setRenamingTag(true);
                }}
              >
                重命名
              </Button>
              <Button size="sm" variant="danger" onClick={() => setDeletingTag(true)}>
                删除该标签
              </Button>
            </div>
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
              <button type="button" onClick={() => setParams({ tag: t.id })} className="flex items-center gap-1.5 px-1">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: tagDotColor(t.color) }} />
                {t.name}
              </button>
            </Pill>
          ))}
        </div>
      )}

      <GlassCard className="p-2">
        {kind === "tags" && !tagId ? (
          <AsyncState query={tagsQuery} skeletonRows={3} skeletonClassName="p-2">
            {tags && tags.length > 0 ? (
              <p className="px-3 py-8 text-center text-sm text-ink-3">
                选择一个标签查看其中的文件，或在文件右键/详情里用「标签…」添加。
              </p>
            ) : (
              <EmptyState icon={meta.icon} title={meta.empty} description="先在上方创建一个标签" />
            )}
          </AsyncState>
        ) : (
          <AsyncState query={nodesQuery} skeletonRows={4} skeletonClassName="p-2">
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
        )}
      </GlassCard>

      <Dialog
        open={renamingTag}
        onClose={() => setRenamingTag(false)}
        title="重命名标签"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenamingTag(false)}>
              取消
            </Button>
            <Button type="submit" form="rename-tag-form" disabled={!renameValue.trim() || update.isPending}>
              保存
            </Button>
          </>
        }
      >
        <form
          id="rename-tag-form"
          onSubmit={(e) => {
            e.preventDefault();
            const name = renameValue.trim();
            if (name && tagId) update.mutate({ id: tagId, name });
          }}
        >
          <label className="block text-xs text-ink-3" htmlFor="tag-rename-input">
            标签名称
          </label>
          <Input
            id="tag-rename-input"
            aria-label="标签名称"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={32}
            className="mt-1"
          />
        </form>
      </Dialog>
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
