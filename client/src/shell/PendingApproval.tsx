import { useQueryClient } from "@tanstack/react-query";
import { Clock3, LogOut, RefreshCw } from "lucide-react";
import { clearSessionFlag } from "../api/client";
import type { Me } from "../api/types";
import { queryKeys } from "../lib/queryKeys";
import { Button, Surface } from "../components/ui";

/** 待审核用户壳：不渲染导航/文件数据，只提供等待、刷新和退出。 */
export function PendingApproval({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const logout = () => {
    clearSessionFlag();
    queryClient.clear();
    window.location.assign("/cdn-cgi/access/logout");
  };
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <Surface className="w-full max-w-md p-6 text-center">
        <span aria-hidden className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-warn-soft text-warn-text">
          <Clock3 size={21} />
        </span>
        <h1 className="text-lg font-semibold text-ink">账号等待审核</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          {me.name}，你的账号已创建，等待家庭管理员在「用户管理」中通过审核。通过后刷新即可使用。
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={() => void queryClient.invalidateQueries({ queryKey: queryKeys.me })}>
            <RefreshCw size={16} aria-hidden />
            刷新状态
          </Button>
          <Button variant="ghost" onClick={logout}>
            <LogOut size={16} aria-hidden />
            退出登录
          </Button>
        </div>
      </Surface>
    </div>
  );
}
