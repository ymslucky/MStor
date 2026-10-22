import { useEffect } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { Me } from "../api/types";
import { IconButton, NavItem } from "../components/ui";
import { CommandPalette } from "../components/CommandPalette";
import StorageMeter from "../components/StorageMeter";
import { AccountMenu } from "./AccountMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { sectionsFor } from "./nav";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { DESKTOP_MEDIA_QUERY } from "../lib/constants";

/**
 * 移动端导航抽屉：Radix Dialog 承载焦点陷阱 / Esc / 遮罩点击 / 滚动锁定 / 焦点还原，
 * 内容与桌面侧栏共用同一份 SECTIONS，并补齐桌面侧栏独有的空间切换、存储用量与账户行
 * （此前移动端无法切空间、看不到搜索入口）。
 */
export function MobileNavDrawer({
  open,
  onClose,
  me,
  onSwitchWorkspace,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  me: Me;
  onSwitchWorkspace: (id: string) => void;
  onLogout: () => void;
}) {
  const account = me.self ?? me;
  const sections = sectionsFor(account.role === "admin");
  // Radix 打开时会锁 body 滚动；若此时跨过 md 断点，抽屉被 CSS 隐藏但锁仍在 → 自动关闭
  const desktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  useEffect(() => {
    if (open && desktop) onClose();
  }, [open, desktop, onClose]);

  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="anim-fade fixed inset-0 z-modal bg-ink/40 backdrop-blur-sm md:hidden" />
        <RadixDialog.Content
          data-testid="mobile-drawer"
          className="anim-pop fixed inset-y-0 left-0 z-modal flex w-72 max-w-[85vw] flex-col bg-surface-1 shadow-glass outline-none md:hidden"
        >
          <RadixDialog.Title className="sr-only">导航</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">应用导航、空间切换与账户操作</RadixDialog.Description>

          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-display text-lg font-bold text-ink">MStor</span>
            <RadixDialog.Close asChild>
              <IconButton label="关闭导航">
                <X size={18} aria-hidden />
              </IconButton>
            </RadixDialog.Close>
          </div>

          <nav aria-label="导航" className="flex-1 overflow-y-auto px-2 py-3">
            {sections.map((section) => (
              <div key={section.title} className="mb-3 last:mb-0">
                <p className="px-3 pb-1 text-2xs font-medium tracking-wide text-ink-3 uppercase">{section.title}</p>
                <div className="flex flex-col gap-0.5">
                  {section.items.map(({ to, label, Icon }) => (
                    <NavItem key={to} to={to} end={to === "/"} icon={<Icon size={18} />} onNavigate={onClose}>
                      {label}
                    </NavItem>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="space-y-3 border-t border-line px-3 py-3">
            <CommandPalette onOpen={onClose} />
            <WorkspaceSwitcher workspaces={me.workspaces ?? []} currentId={me.workspace?.id} onSwitch={onSwitchWorkspace} />
            <StorageMeter usedBytes={me.storage?.usedBytes ?? me.usedBytes} quotaBytes={me.storage?.quotaBytes ?? me.quotaBytes} />
            <AccountMenu account={account} collapsed={false} onLogout={onLogout} />
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
