import { useState } from "react";
import type { Node } from "../api/types";

/**
 * 文件页的「弹窗群」状态集中管理。
 *
 * 当前实现是最小可用形态：一组与弹窗一一对应的 useState。
 * 之所以先抽成 hook：把"哪个弹窗开着、对哪个节点"这件事从页面组件里拿出来，
 * 后续若需要互斥（同时只允许一个弹窗）可在此换成 discriminated union reducer，
 * 页面侧调用点不变。
 */
export function useBrowserDialogs() {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Node | null>(null);
  const [moving, setMoving] = useState<Node | null>(null);
  const [preview, setPreview] = useState<Node | null>(null);
  const [sharing, setSharing] = useState<Node | null>(null);
  const [deleting, setDeleting] = useState<Node | null>(null);
  const [detail, setDetail] = useState<Node | null>(null);
  const [copying, setCopying] = useState<Node | null>(null);
  const [tagging, setTagging] = useState<Node | null>(null);

  return {
    creating,
    setCreating,
    renaming,
    setRenaming,
    moving,
    setMoving,
    preview,
    setPreview,
    sharing,
    setSharing,
    deleting,
    setDeleting,
    detail,
    setDetail,
    copying,
    setCopying,
    tagging,
    setTagging,
  };
}
