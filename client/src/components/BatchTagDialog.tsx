import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { attachTag, listTags } from "../api/library";
import { queryKeys } from "../lib/queryKeys";
import { tagDotColor } from "../lib/tagColors";
import { AsyncState } from "./AsyncState";
import { toast } from "./Toaster";
import { Button, Dialog } from "./ui";

/**
 * 批量打标签：对当前选中的 N 个节点追加同一个标签。
 * 只做「追加」不做「移除」——移除需要知道每个节点现状，交给单节点 TagDialog。
 */
export function BatchTagDialog({
  nodeIds,
  onClose,
  onDone,
}: {
  nodeIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const tags = useQuery({ queryKey: queryKeys.library("tags", null), queryFn: listTags, meta: { silent: true } });
  const [tagId, setTagId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!tagId || busy || nodeIds.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(nodeIds.map((id) => attachTag(tagId, id)));
      toast(`已为 ${nodeIds.length} 项添加标签`, "info");
      void queryClient.invalidateQueries({ queryKey: ["library", "tags"] });
      for (const id of nodeIds) void queryClient.invalidateQueries({ queryKey: queryKeys.nodeTags(id) });
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "批量添加标签失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`批量标签 · ${nodeIds.length} 项`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!tagId || busy} onClick={() => void submit()}>
            {busy ? "添加中…" : "添加到选中项"}
          </Button>
        </>
      }
    >
      <AsyncState query={tags} skeletonRows={3}>
        {tags.data?.tags.length ? (
          <ul className="max-h-64 space-y-1 overflow-auto">
            {tags.data.tags.map((t) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-bg-sub">
                  <input
                    type="radio"
                    name="batch-tag"
                    aria-label={`标签 ${t.name}`}
                    checked={tagId === t.id}
                    onChange={() => setTagId(t.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tagDotColor(t.color) }} />
                  <span className="min-w-0 flex-1 truncate text-ink">{t.name}</span>
                  {typeof t.nodes === "number" && <span className="num text-xs text-ink-3">{t.nodes}</span>}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 py-3 text-sm text-ink-3">还没有标签，请先到「标签」页创建。</p>
        )}
      </AsyncState>
      <p className="mt-3 text-xs text-ink-3">会把该标签追加到选中的 {nodeIds.length} 项；已打过的不会重复。</p>
    </Dialog>
  );
}
