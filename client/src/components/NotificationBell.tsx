import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";
import type { Notification } from "../api/notifications";
import { formatDate } from "../lib/format";
import { queryKeys } from "../lib/queryKeys";
import { Button, Panel, Pill, Skeleton } from "./ui";

/** 今天 0 点（本地时区）：分组边界 */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 站内通知铃铛：只在打开时拉一次（不轮询），未读数来自 /api/me.unreadNotifications 与列表接口。
 * 明确不做邮件投递——方案 §0.1 假设 A2。
 * 列表按「未读优先 + 时间倒序」排序，再按「今天 / 更早」分组；未读数用 Pill（上限 99+）。
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // 关闭时把焦点还给铃铛（Esc/关闭按钮路径），点外面关闭则不抢焦点
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isPending } = useQuery({ queryKey: queryKeys.notifications, queryFn: listNotifications, enabled: open });
  const unread = data?.unread ?? 0;
  const items = useMemo(() => data?.items ?? [], [data]);

  // 未读优先（read_at 为 null 排在前面），同组内按时间倒序
  const groups = useMemo(() => {
    const t0 = startOfToday();
    const sorted = [...items].sort(
      (a, b) => (a.read_at === null ? 0 : 1) - (b.read_at === null ? 0 : 1) || b.created_at - a.created_at,
    );
    return [
      { key: "today", title: "今天", items: sorted.filter((n) => n.created_at >= t0) },
      { key: "earlier", title: "更早", items: sorted.filter((n) => n.created_at < t0) },
    ].filter((g) => g.items.length > 0);
  }, [items]);

  const read = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });

  // 点外面关闭（简单实现，不引入弹层库）
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // 打开后把焦点移入面板：读屏能进入通知列表
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // Esc 挂 document：Tab 走出面板或点击非聚焦区域后焦点可能回 body，面板上的 onKeyDown 会失效
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const openItem = (n: Notification) => {
    if (!n.read_at) read.mutate(n.id);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        ref={buttonRef}
        aria-label={unread > 0 ? `通知（${unread} 条未读）` : "通知"}
        aria-expanded={open}
        onClick={() => (open ? close(true) : setOpen(true))}
        className="state-layer relative flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 hover:text-primary-text"
      >
        <Bell size={18} aria-hidden />
        {unread > 0 && (
          <Pill tone="danger" className="absolute -top-1 -right-1 min-w-4 justify-center px-1">
            {unread > 99 ? "99+" : unread}
          </Pill>
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="通知列表"
          tabIndex={-1}
          className="outline-none"
        >
        <Panel level="e3" className="absolute right-0 top-11 z-modal w-80 overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
              通知
              {items.length > 0 &&
                (unread > 0 ? <Pill tone="danger">未读 {unread > 99 ? "99+" : unread}</Pill> : <Pill tone="success">全部已读</Pill>)}
            </span>
            {unread > 0 && (
              <Button variant="ghost" size="sm" disabled={readAll.isPending} onClick={() => readAll.mutate()}>
                全部已读
              </Button>
            )}
          </div>

          {isPending ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm text-ink-2">暂无通知</p>
              <p className="mt-1 text-2xs text-ink-3">有人分享文件、配额告警时会出现在这里</p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-auto">
              {groups.map((g) => (
                <li key={g.key}>
                  <p className="px-3 pt-2 pb-1 text-2xs font-medium text-ink-3">{g.title}</p>
                  <ul className="divide-y divide-line">
                    {g.items.map((n) => (
                      <li key={n.id} className={n.read_at ? "opacity-60" : ""}>
                        <button
                          type="button"
                          className="state-layer w-full px-3 py-2 text-left"
                          onClick={() => openItem(n)}
                        >
                          <span className="block text-sm text-ink">{n.title}</span>
                          {n.body && <span className="mt-0.5 block text-xs text-ink-3">{n.body}</span>}
                          <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-3">
                            <span className="num">{formatDate(n.created_at)}</span>
                            {!n.read_at && <Pill tone="accent">未读</Pill>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        </div>
      )}
    </div>
  );
}
