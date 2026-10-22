import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, KeyRound, Link2 } from "lucide-react";
import { renderSVG } from "uqr";
import { createShare } from "../api/shares";
import type { Node } from "../api/types";
import { toast } from "../components/Toaster";
import { queryKeys } from "../lib/queryKeys";
import { Button, Dialog, Input } from "./ui";

interface Props {
  node: Node;
  onClose: () => void;
}

export default function ShareDialog({ node, onClose }: Props) {
  const queryClient = useQueryClient();
  // 默认 7 天有效期；清空为永久
  const [days, setDays] = useState("7");
  const [password, setPassword] = useState("");
  // 下载次数：不限 / 一次性（1 次）/ 自定义上限
  const [limitMode, setLimitMode] = useState<"none" | "once" | "custom">("none");
  const [maxDownloads, setMaxDownloads] = useState("10");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (days && !(Number(days) > 0)) {
      toast("有效天数须为正数");
      return;
    }
    if (limitMode === "custom" && !(Number(maxDownloads) > 0)) {
      toast("下载次数须为正整数");
      return;
    }
    setBusy(true);
    try {
      const res = await createShare({
        nodeId: node.id,
        expiresInDays: days ? Number(days) : undefined,
        password: password || undefined,
        oneTime: limitMode === "once" || undefined,
        maxDownloads: limitMode === "custom" ? Number(maxDownloads) || undefined : undefined,
      });
      setUrl(res.url);
      // 列表的「已分享」角标来自 ["shares"] 缓存，创建成功后必须失效
      void queryClient.invalidateQueries({ queryKey: queryKeys.shares });
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
          {/* 二维码：手机扫码直接打开分享（renderSVG 零依赖生成） */}
          <div
            className="mx-auto w-24 [&>svg]:h-full [&>svg]:w-full"
            aria-label="分享链接二维码"
            dangerouslySetInnerHTML={{ __html: renderSVG(url, { pixelSize: 4 }) }}
          />
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
              有效天数（默认 7 天，清空为永久）
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
          <fieldset className="mt-3">
            <legend className="text-xs text-ink-2">下载次数</legend>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {([
                ["none", "不限"],
                ["once", "一次性"],
                ["custom", "自定义上限"],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1">
                  <input
                    type="radio"
                    name="share-limit"
                    value={value}
                    checked={limitMode === value}
                    onChange={() => setLimitMode(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {limitMode === "custom" && (
              <Input
                aria-label="最大下载次数"
                type="number"
                min="1"
                className="mt-1"
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(e.target.value)}
              />
            )}
          </fieldset>
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
