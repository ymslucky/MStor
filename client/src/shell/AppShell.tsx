import { MutationCache, QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { ApiError } from "../api/client";
import { getMe } from "../api/me";
import type { Me } from "../api/types";
import { formatBytes } from "../lib/format";
import SearchBox from "../components/SearchBox";
import { Toaster, toast } from "../components/Toaster";

export function makeQueryClient(): QueryClient {
  const onError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) return; // 已由 api() 跳登录
    toast(e instanceof Error ? e.message : "请求失败");
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

function useMe(): Me | undefined {
  const { data } = useQuery({ queryKey: ["me"], queryFn: getMe });
  return data;
}

const NAV = [
  { to: "/", label: "文件" },
  { to: "/trash", label: "回收站" },
  { to: "/shares", label: "分享" },
  { to: "/settings", label: "设置" },
];

export default function AppShell() {
  const me = useMe();
  if (!me) return <div className="p-8 text-center text-slate-500">加载中…</div>;
  const actAs = typeof localStorage !== "undefined" ? localStorage.getItem("mstor_act_as") : null;
  const pct = Math.min(100, Math.round((me.usedBytes / me.quotaBytes) * 100));
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-4 py-2">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-lg font-bold">MStor</span>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  `rounded px-2 py-1 ${isActive ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <SearchBox />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="hidden w-32 sm:block" title={`${formatBytes(me.usedBytes)} / ${formatBytes(me.quotaBytes)}`}>
              <div className="h-1.5 w-full rounded bg-slate-200">
                <div className={`h-1.5 rounded ${pct > 90 ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {formatBytes(me.usedBytes)} / {formatBytes(me.quotaBytes)}
              </div>
            </div>
            <span>{me.name}</span>
            <a href="/auth/logout" className="text-slate-500 hover:underline">
              退出
            </a>
          </div>
        </div>
        {actAs && (
          <div className="mx-auto mt-1 max-w-5xl rounded bg-amber-100 px-3 py-1 text-xs text-amber-800">
            正在以管理员身份查看「{me.name}」的空间
            <button
              className="ml-2 underline"
              onClick={() => {
                localStorage.removeItem("mstor_act_as");
                window.location.reload();
              }}
            >
              退出该空间
            </button>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet context={me} />
      </main>
      <Toaster />
    </div>
  );
}
