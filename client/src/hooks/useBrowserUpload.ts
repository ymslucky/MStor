import { useCallback, useMemo, useState } from "react";
import type { Node } from "../api/types";
import { uniqueName } from "../components/ConflictDialog";
import type { ConflictPolicy } from "../components/ConflictDialog";
import { getString, setString } from "../lib/storage";

const CONFLICT_KEY = "mstor_upload_conflict";

interface Deps {
  dir: string;
  /** 当前目录已有节点（用名称做冲突检测） */
  nodes: Node[];
  add: (items: (File | { file: File; path?: string })[], parentId: string) => void;
  /** 覆盖策略需要彻底删除同名节点（软删仍占唯一名） */
  purge: (id: string) => Promise<unknown>;
}

/**
 * 上传入队 + 同名冲突策略（保留两者 / 覆盖 / 跳过，可记住选择）。
 * 决策在这里，UI（ConflictDialog）只负责把用户选择回传。
 */
export function useBrowserUpload({ dir, nodes, add, purge }: Deps) {
  const [conflicts, setConflicts] = useState<{ files: File[]; names: string[] } | null>(null);
  const [remember, setRemember] = useState(() => getString(CONFLICT_KEY) !== "");
  const taken = useMemo(() => new Set(nodes.map((n) => n.name)), [nodes]);

  const applyPolicy = useCallback(
    (policy: ConflictPolicy, files: File[]) => {
      if (policy === "skip") {
        add(files.filter((f) => !taken.has(f.name)), dir);
        return;
      }
      if (policy === "keepBoth") {
        const used = new Set(taken);
        const renamed = files.map((f) => {
          if (!taken.has(f.name)) return f;
          const name = uniqueName(f.name, used);
          used.add(name);
          return new File([f], name, { type: f.type });
        });
        add(renamed, dir);
        return;
      }
      const ids = nodes.filter((n) => files.some((f) => f.name === n.name)).map((n) => n.id);
      void Promise.all(ids.map((id) => purge(id))).then(() => add(files, dir));
    },
    [add, dir, nodes, purge, taken],
  );

  const enqueue = useCallback(
    (items: (File | { file: File; path?: string })[]) => {
      const plain = items.filter((i): i is File => i instanceof File);
      const withPath = items.filter((i) => !(i instanceof File));
      if (withPath.length) add(withPath, dir);
      if (!plain.length) return;
      const dup = plain.filter((f) => taken.has(f.name)).map((f) => f.name);
      if (!dup.length) {
        add(plain, dir);
        return;
      }
      const remembered = getString(CONFLICT_KEY);
      if (remembered === "keepBoth" || remembered === "overwrite" || remembered === "skip") {
        applyPolicy(remembered, plain);
        return;
      }
      setConflicts({ files: plain, names: dup });
    },
    [add, applyPolicy, dir, taken],
  );

  const decide = useCallback(
    (policy: ConflictPolicy) => {
      if (!conflicts) return;
      if (remember) setString(CONFLICT_KEY, policy);
      const files = conflicts.files;
      setConflicts(null);
      applyPolicy(policy, files);
    },
    [applyPolicy, conflicts, remember],
  );

  return { conflicts, cancel: () => setConflicts(null), decide, enqueue, remember, setRemember };
}
