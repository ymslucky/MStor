import { useState } from "react";
import { Badge, Button, Dialog, Field, GlassCard, IconButton, Input, ListRow, NavItem, Panel, Pill, Skeleton, Surface } from "../components/ui";
import { cn } from "../lib/cn";
import { readDensity, readSkin, setDensity, setSkin } from "../lib/appearance";
import type { Density, Skin } from "../lib/appearance";
import { Cloud } from "lucide-react";

const SWATCHES: { name: string; varName: string; note: string }[] = [
  { name: "bg", varName: "--color-bg", note: "页面底色（含三色光晕）" },
  { name: "surface-1", varName: "--color-surface-1", note: "卡片 / 输入 / 面板" },
  { name: "surface-2", varName: "--color-surface-2", note: "顶栏 / 弹窗" },
  { name: "bg-sub", varName: "--color-bg-sub", note: "次级区块 / hover" },
  { name: "ink", varName: "--color-ink", note: "主文字" },
  { name: "ink-2", varName: "--color-ink-2", note: "次要文字" },
  { name: "ink-3", varName: "--color-ink-3", note: "弱文字 / 占位" },
  { name: "line", varName: "--color-line", note: "发丝描边" },
  { name: "primary", varName: "--color-primary", note: "唯一强调色（薄荷青）" },
  { name: "primary-soft", varName: "--color-primary-soft", note: "强调浅底" },
  { name: "success", varName: "--color-success", note: "状态：成功" },
  { name: "warn", varName: "--color-warn", note: "状态：警告" },
  { name: "danger", varName: "--color-danger", note: "状态：危险" },
];

const RADII = ["rounded-chip", "rounded-btn", "rounded-input", "rounded-card", "rounded-panel"];
const SHADOWS = ["shadow-soft", "shadow-card", "shadow-lift", "shadow-glass"];
const TYPE = [
  { cls: "text-2xl", label: "2xl · 30/34" },
  { cls: "text-xl", label: "xl · 22/28" },
  { cls: "text-lg", label: "lg · 18/26" },
  { cls: "text-base", label: "base · 15/24" },
  { cls: "text-sm", label: "sm · 13/20" },
  { cls: "text-xs", label: "xs · 12/18" },
  { cls: "text-2xs", label: "2xs · 11/16" },
];

/**
 * /design —— 设计系统的可执行规范：令牌与全部原语的真实渲染。
 * 任何人改主题后打开这一页就能看到影响面；新增原语必须先在这里登记。
 */
const SKINS: { key: Skin; label: string }[] = [
  { key: "paper", label: "Paper · 明亮纸感" },
  { key: "slate", label: "Slate · 冷灰控制台" },
  { key: "ink", label: "Ink · 深色优先" },
];
const DENSITIES: { key: Density; label: string }[] = [
  { key: "comfortable", label: "舒适" },
  { key: "compact", label: "紧凑" },
];

export default function DesignPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [skin, setSkinState] = useState<Skin>(() => readSkin());
  const [density, setDensityState] = useState<Density>(() => readDensity());

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">设计系统 v6</h1>
        <p className="mt-1 text-sm text-ink-2">
          明亮清新 · 真毛玻璃 · 活泼动效。令牌唯一来源 <code className="rounded bg-bg-sub px-1">client/src/index.css</code> 的
          <code className="ml-1 rounded bg-bg-sub px-1">@theme</code>；原语位于
          <code className="ml-1 rounded bg-bg-sub px-1">components/ui</code>。
        </p>
      </header>

      <GlassCard className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">皮肤与密度</h2>
        <div className="flex flex-wrap items-center gap-2">
          {SKINS.map((s) => (
            <Button
              key={s.key}
              size="sm"
              variant={skin === s.key ? "primary" : "ghost"}
              onClick={() => {
                setSkin(s.key);
                setSkinState(s.key);
              }}
            >
              {s.label}
            </Button>
          ))}
          <span aria-hidden className="mx-1 h-5 w-px bg-line" />
          {DENSITIES.map((x) => (
            <Button
              key={x.key}
              size="sm"
              variant={density === x.key ? "primary" : "ghost"}
              onClick={() => {
                setDensity(x.key);
                setDensityState(x.key);
              }}
            >
              {x.label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-3">皮肤只覆盖颜色令牌，密度只改行高与内边距；结构不变。</p>
      </GlassCard>

      <GlassCard className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">颜色令牌</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SWATCHES.map((s) => (
            <Surface key={s.name} className="bg-surface-1/60 p-2">
              <div className="h-10 rounded-btn border border-line" style={{ background: `var(${s.varName})` }} />
              <p className="mt-1.5 truncate text-xs font-medium text-ink">{s.name}</p>
              <p className="truncate text-2xs text-ink-3">{s.note}</p>
            </Surface>
          ))}
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-2">
        <GlassCard className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">圆角阶梯</h2>
          <div className="flex flex-wrap items-end gap-2">
            {RADII.map((r) => (
              <div key={r} className="text-center">
                <div className={cn("h-12 w-16 border border-line bg-primary-soft", r)} />
                <p className="mt-1 text-2xs text-ink-3">{r.replace("rounded-", "")}</p>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">阴影阶梯</h2>
          <div className="flex flex-wrap items-end gap-3">
            {SHADOWS.map((s) => (
              <div key={s} className="text-center">
                <div className={cn("h-12 w-16 rounded-card bg-surface-1", s)} />
                <p className="mt-1 text-2xs text-ink-3">{s.replace("shadow-", "")}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">字号阶梯</h2>
        <div className="space-y-1">
          {TYPE.map((t) => (
            <div key={t.cls} className="flex items-baseline gap-3">
              <span className="w-24 shrink-0 text-2xs text-ink-3">{t.label}</span>
              <span className={cn("truncate text-ink", t.cls)}>MStor 私有云盘 · 明亮清新</span>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">原语（7）</h2>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button>主操作</Button>
            <Button variant="ghost">次操作</Button>
            <Button variant="danger">危险</Button>
            <Button size="sm">小号</Button>
            <Button disabled>禁用</Button>
            <IconButton label="图标按钮">
              <Cloud size={18} aria-hidden />
            </IconButton>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>默认</Badge>
            <Badge tone="accent">强调</Badge>
            <Badge tone="success">成功</Badge>
            <Badge tone="danger">危险</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill>已过期</Pill>
            <Pill tone="accent">已分享</Pill>
            <Pill tone="success">已完成</Pill>
            <Pill tone="warn">临近配额</Pill>
            <Pill tone="danger">已用尽</Pill>
          </div>
          <Surface className="p-3 text-sm text-ink-2">Surface（卡片/面板唯一出处）</Surface>
          <Panel level="e2" className="max-w-xs">
            <ListRow selected>Panel + ListRow（选中态）</ListRow>
            <ListRow>Panel + ListRow（hover 态）</ListRow>
          </Panel>
          <div className="max-w-xs">
            <Field label="字段标签" hint="辅助说明走 type-label" required>
              <Input placeholder="Field 包裹的输入框" />
            </Field>
            <Field label="出错状态" error="这里会显示错误并带 role=alert">
              <Input defaultValue="bad value" />
            </Field>
          </div>
          <div className="flex max-w-xs flex-col gap-1">
            <NavItem to="/design">NavItem（当前路由高亮）</NavItem>
            <NavItem to="/settings">NavItem（普通态）</NavItem>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="输入框（focus 主色描边）" aria-label="示例输入" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-4 flex-1" />
            </div>
          </div>
          <Button variant="ghost" onClick={() => setDialogOpen(true)}>
            打开 Dialog（Radix：焦点陷阱 / Esc / aria）
          </Button>
          <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Dialog 示例">
            <p className="text-sm text-ink-2">这是一个由 Radix Dialog 驱动的弹窗：焦点被锁在内部，Esc 关闭，关闭后焦点回到触发按钮。</p>
          </Dialog>
        </div>
      </GlassCard>

      <p className="pb-4 text-center text-2xs text-ink-3">
        新增原语或令牌时，先在此页登记再接入业务组件 —— 这是设计系统的唯一验收方式。
      </p>
    </div>
  );
}
