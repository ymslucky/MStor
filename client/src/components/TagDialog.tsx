import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { attachTag, createTag, detachTag, listNodeTags, listTags } from "../api/library";
import type { Node } from "../api/types";
import { queryKeys } from "../lib/queryKeys";
import { AsyncState } from "./AsyncState";
import { toast } from "./Toaster";
import { Button, Dialog, Input, Pill } from "./ui";

/**
 * 节点标签弹窗：回显已打标签 + 勾选即时打/解 + 新建并添加。
 * 标签属于空间级共享资源，任何成员都可维护；跨空间 id 由服务端 404 兜底。
 */
export function TagDialog({ node, onClose }: { node: Node; onClose: () => void }) {
  const queryClient = useQueryClient();
  const tags = useQuery({
    queryKey: queryKeys.library("tags", null),
    queryFn: listTags,
    meta: { silent: true },
  });
  const attachedQuery = useQuery({
    queryKey: queryKeys.nodeTags(node.id),
    queryFn: () => listNodeTags(node.id),
    meta: { silent: true },
  });
  const [attached, setAttached] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!attachedQuery.data) return;
    setAttached(new Set(attachedQuery.data.tags.map((t) => t.id)));
  }, [attachedQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["library", "tags"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.nodeTags(node.id) });
  };

  const toggle = async (tagId: string) => {
    if (pending.has(tagId)) return;
    const on = attached.has(tagId);
    setAttached((prev) => {
      const next = new Set(prev);
      if (on) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
    setPending((prev) => new Set(prev).add(tagId));
    try {
      await (on ? detachTag(tagId, node.id) : attachTag(tagId, node.id));
      invalidate();
    } catch (e) {
      // 失败回滚勾选
      setAttached((prev) => {
        const next = new Set(prev);
        if (on) next.add(tagId);
        else next.delete(tagId);
        return next;
      });
      toast(e instanceof Error ? e.message : "标签更新失败");
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
    }
  };

  const addTag = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const tag = await createTag(name);
      await attachTag(tag.id, node.id);
      setNewName("");
      setAttached((prev) => new Set(prev).add(tag.id));
      invalidate();
      toast(`已创建标签「${name}」`, "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "创建标签失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`标签 · ${node.name}`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
      }
    >
      <AsyncState query={tags} skeletonRows={3}>
        {tags.data?.tags.length ? (
          <ul className="max-h-64 space-y-1 overflow-auto">
            {tags.data.tags.map((t) => {
              const on = attached.has(t.id);
              return (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-bg-sub">
                    <input
                      type="checkbox"
                      aria-label={`标签 ${t.name}`}
                      checked={on}
                      disabled={pending.has(t.id) || attachedQuery.isPending}
                      onChange={() => void toggle(t.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate text-ink">{t.name}</span>
                    {typeof t.nodes === "number" && <Pill tone="neutral">{t.nodes}</Pill>}
                    {on && <Check size={14} aria-hidden className="text-success-text" />}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-2 py-3 text-sm text-ink-3">还没有标签，先创建一个。</p>
        )}
      </AsyncState>

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addTag();
        }}
      >
        <label className="flex-1">
          <span className="sr-only">新标签名</span>
          <Input
            aria-label="新标签名"
            placeholder="新标签名…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={32}
          />
        </label>
        <Button type="submit" disabled={!newName.trim() || creating}>
          {creating ? "创建中…" : "创建并添加"}
        </Button>
      </form>
    </Dialog>
  );
}
