import { useState } from "react";
import { createShare } from "../api/shares";
import type { Node } from "../api/types";

interface Props {
  node: Node;
  onClose: () => void;
}

export default function ShareDialog({ node, onClose }: Props) {
  const [days, setDays] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await createShare({
        nodeId: node.id,
        expiresInDays: days ? Number(days) : undefined,
        password: password || undefined,
      });
      setUrl(res.url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-96 rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 font-semibold">分享「{node.name}」</h2>
        {url ? (
          <>
            <input readOnly value={url} className="w-full rounded border px-2 py-1.5 text-sm" onFocus={(e) => e.target.select()} />
            <button
              className="mt-2 w-full rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
              onClick={() => void navigator.clipboard.writeText(url)}
            >
              复制链接
            </button>
          </>
        ) : (
          <>
            <label className="mt-2 block text-xs text-slate-500">
              有效天数（可选，留空永久）
              <input
                aria-label="有效天数（可选）"
                type="number"
                min="1"
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
            <label className="mt-2 block text-xs text-slate-500">
              提取码（可选）
              <input
                aria-label="提取码（可选）"
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2 text-sm">
              <button className="rounded px-3 py-1.5 hover:bg-slate-100" onClick={onClose}>关闭</button>
              <button className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50" disabled={busy} onClick={() => void submit()}>
                创建
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
