import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { downloadShared, fetchShare, fetchShareChildren } from "../api/shares";
import type { PublicNode } from "../api/types";
import { formatBytes } from "../lib/format";

interface Crumb {
  id: string;
  name: string;
}

export default function SharePage() {
  const { token = "" } = useParams();
  const [password, setPassword] = useState("");
  const [entered, setEntered] = useState(false);
  // 已提交查询用的提取码：仅点「解锁」时更新，输入过程不触发请求
  const [usedPassword, setUsedPassword] = useState("");
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [current, setCurrent] = useState<{ id: string; name: string } | null>(null);

  const info = useQuery({
    queryKey: ["share", token, entered ? usedPassword : ""],
    queryFn: () => fetchShare(token, entered ? usedPassword : undefined),
    retry: false,
  });

  const needsPassword = info.error instanceof ApiError && info.error.code === "SHARE_PASSWORD";
  const expired = info.error instanceof ApiError && info.error.status === 410;
  const gone = info.error instanceof ApiError && !needsPassword && !expired && info.error.status === 404;

  const children = useQuery({
    queryKey: ["share-children", token, current?.id ?? "", password],
    queryFn: () => fetchShareChildren(token, current!.id, password || undefined),
    enabled: !!current,
  });

  if (info.isPending) return <div className="p-10 text-center text-sm text-slate-400">加载中…</div>;
  // 已提交且因提取码失败时也回到门内，允许改码重试
  if (needsPassword)
    return (
      <div className="mx-auto mt-24 w-80 rounded-lg border bg-white p-6 text-center shadow">
        <p className="mb-3 text-sm">{entered ? "提取码不正确，请重试" : "该分享需要提取码"}</p>
        <input
          aria-label="提取码"
          className="w-full rounded border px-2 py-1.5 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="mt-3 w-full rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
          onClick={() => {
            setUsedPassword(password);
            setEntered(true);
          }}
        >
          解锁
        </button>
      </div>
    );
  if (expired || gone)
    return <div className="mt-24 text-center text-sm text-slate-500">{info.error?.message}</div>;
  if (info.error) return <div className="mt-24 text-center text-sm text-slate-500">加载失败：{info.error.message}</div>;
  if (!info.data) return null;

  // 文件夹分享：current 决定层级；单文件分享：仅展示自身（id 来自 ShareInfo，供拼 raw 下载）
  const files: PublicNode[] = current
    ? (children.data?.children ?? [])
    : info.data.isDir
      ? (info.data.children ?? [])
      : [{ id: info.data.id, name: info.data.name, isDir: false, size: info.data.size, mime: info.data.mime }];

  const download = (f: PublicNode) => {
    void downloadShared(token, f.id, f.name, password || undefined);
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-xl font-bold">MStor 分享</h1>
      <p className="mb-4 text-sm text-slate-500">
        共享对象：{info.data.name}
        {info.data.expiresAt ? ` · 有效期至 ${new Date(info.data.expiresAt).toLocaleDateString("zh-CN")}` : ""}
      </p>
      {/* 单文件分享无可浏览层级，不渲染面包屑（避免与文件行重名） */}
      {info.data.isDir && (
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm">
          <button className="hover:underline" onClick={() => { setCurrent(null); setCrumbs([]); }}>{info.data.name}</button>
          {crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="text-slate-300">/</span>
              <button
                className="hover:underline"
                onClick={() => {
                  // 该项变为当前目录，从 crumbs 中移除，避免按钮与「（当前）」重复
                  setCrumbs(crumbs.slice(0, i));
                  setCurrent(c);
                }}
              >
                {c.name}
              </button>
            </span>
          ))}
          {current && <span className="text-slate-500">（当前：{current.name}）</span>}
        </nav>
      )}
      <table className="w-full text-sm">
        <tbody>
          {files.map((f) => (
            <tr key={f.id} className="border-b">
              <td className="py-2">
                {f.isDir ? (
                  <button
                    className="text-left hover:underline"
                    onClick={() => {
                      // 根目录已有同名按钮，进入子目录时才把父目录压入面包屑，避免重复
                      setCrumbs(current ? [...crumbs, { id: current.id, name: current.name }] : crumbs);
                      setCurrent({ id: f.id, name: f.name });
                    }}
                  >
                    📁 <span>{f.name}</span>
                  </button>
                ) : (
                  <span>
                    📄 <span>{f.name}</span>
                  </span>
                )}
              </td>
              <td className="py-2 text-xs text-slate-400">{formatBytes(f.size)}</td>
              <td className="py-2 text-right">
                {!f.isDir && (
                  <button className="text-blue-600 hover:underline" onClick={() => download(f)}>
                    下载 {f.name}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!files.length && <tr><td colSpan={3} className="py-10 text-center text-sm text-slate-400">空文件夹</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
