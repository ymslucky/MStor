import { useState } from "react";
import { CalendarClock, KeyRound, Link2 } from "lucide-react";
import { createShare } from "../api/shares";
import type { Node } from "../api/types";
import { toast } from "../components/Toaster";
import { Button, Dialog, Input } from "./ui";

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
    if (days && !(Number(days) > 0)) {
      toast("有效天数须为正数");
      return;
    }
    setBusy(true);
    try {
      const res = await createShare({
        nodeId: node.id,
        expiresInDays: days ? Number(days) : undefined,
        password: password || undefined,
      });
      setUrl(res.url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "创建分享失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      skin="white"
      title={`分享「${node.name}」`}
      footer={
        url ? undefined : (
          <>
            <Button variant="ghost" onClick={onClose}>关闭</Button>
            <Button disabled={busy} onClick={() => void submit()}>创建</Button>
          </>
        )
      }
    >
      {url ? (
        <>
          <Input readOnly value={url} onFocus={(e) => e.target.select()} />
          <Button className="mt-2 w-full" onClick={() => void navigator.clipboard.writeText(url)}>
            <Link2 size={16} aria-hidden />
            复制链接
          </Button>
        </>
      ) : (
        <>
          <label className="block text-xs text-ink-2">
            <span className="flex items-center gap-1">
              <CalendarClock size={14} aria-hidden className="text-ink-3" />
              有效天数（可选，留空永久）
            </span>
            <Input
              aria-label="有效天数（可选）"
              type="number"
              min="1"
              className="mt-1"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>
          <label className="mt-2 block text-xs text-ink-2">
            <span className="flex items-center gap-1">
              <KeyRound size={14} aria-hidden className="text-ink-3" />
              提取码（可选）
            </span>
            <Input
              aria-label="提取码（可选）"
              className="mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </>
      )}
    </Dialog>
  );
}
