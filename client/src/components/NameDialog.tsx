import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  initial?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

export default function NameDialog({ title, initial = "", onSubmit, onCancel, busy }: Props) {
  const [name, setName] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-80 rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 font-semibold">{title}</h2>
        <input
          ref={ref}
          aria-label="名称"
          className="w-full rounded border px-2 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSubmit(name.trim())}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2 text-sm">
          <button className="rounded px-3 py-1.5 hover:bg-slate-100" onClick={onCancel}>取消</button>
          <button
            className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
            disabled={!name.trim() || busy}
            onClick={() => onSubmit(name.trim())}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
