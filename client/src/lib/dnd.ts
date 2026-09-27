// HTML5 DnD 节点拖拽负载：文件行/卡片 dragstart 写入，文件夹行与面包屑 drop 读取
export const NODE_DRAG_TYPE = "application/x-mstor-node";

export interface NodeDragPayload {
  id: string;
  isDir: boolean;
}

export function setNodeDrag(dt: DataTransfer, node: { id: string; is_dir: 0 | 1 }): void {
  const payload: NodeDragPayload = { id: node.id, isDir: !!node.is_dir };
  dt.setData(NODE_DRAG_TYPE, JSON.stringify(payload));
  dt.setData("text/plain", node.id);
  dt.effectAllowed = "move";
}

export function readNodeDrag(dt: DataTransfer | null): NodeDragPayload | null {
  if (!dt) return null;
  const raw = dt.getData(NODE_DRAG_TYPE);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as NodeDragPayload;
    return payload && typeof payload.id === "string" ? payload : null;
  } catch {
    return null;
  }
}

// dragover 阶段浏览器保护模式下 getData 返回空串，只能靠 types 判断
export function hasNodeDrag(dt: DataTransfer | null): boolean {
  return !!dt?.types?.includes(NODE_DRAG_TYPE);
}
