import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";
import { formatDate } from "../lib/format";

/**
 * 站内通知铃铛：只在打开时拉一次（不轮询），未读数来自 /api/me.unreadNotifications 与列表接口。
 * 明确不做邮件投递——方案 §0.1 假设 A2。
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: listNotifications, enabled: open });
  const unread = data?.unread ?? 0;

  const read = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  // 点外面关闭（简单实现，不引入弹层库）
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-label={unread > 0 ? `通知（${unread} 条未读）` : "通知"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 hover:bg-primary-soft hover:text-primary-text"
      >
        <Bell size={18} aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-2xs font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="通知列表"
          className="absolute right-0 top-11 z-modal w-80 overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-medium text-ink">通知</span>
            <button
              type="button"
              className="text-xs text-primary-text hover:underline disabled:opacity-50"
              disabled={!unread || readAll.isPending}
              onClick={() => readAll.mutate()}
            >
              全部已读
            </button>
          </div>
          <ul className="max-h-80 divide-y divide-line overflow-auto">
            {(data?.items ?? []).length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-ink-3">暂无通知</li>
            ) : (
              (data?.items ?? []).map((n) => (
                <li key={n.id} className={n.read_at ? "opacity-60" : ""}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-primary-soft/40"
                    onClick={() => {
                      if (!n.read_at) read.mutate(n.id);
                      if (n.link) {
                        setOpen(false);
                        navigate(n.link);
                      }
                    }}
                  >
                    <span className="block text-sm text-ink">{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-xs text-ink-3">{n.body}</span>}
                    <span className="mt-0.5 block text-2xs text-ink-3">{formatDate(n.created_at)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
