import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Node } from "../api/types";
import { renderWithProviders } from "../test/utils";
import { Toaster } from "./Toaster";
import FileList from "./FileList";

function node(over: Partial<Node> = {}): Node {
  return {
    id: "f1", parent_id: "", name: "hello.txt", is_dir: 0, size: 12,
    mime: "text/plain", created_at: 1, updated_at: 2, ...over,
  };
}

const noop = () => {};

function renderList(nodes: Node[], opts: { selectable?: boolean } = {}) {
  const user = userEvent.setup();
  const onToggle = opts.selectable ? vi.fn() : undefined;
  renderWithProviders(
    <>
      <FileList
        nodes={nodes}
        onOpenDir={noop}
        onOpenFile={noop}
        selectable={opts.selectable}
        selected={new Set()}
        onToggle={onToggle}
        actions={(n) => (
          <button type="button" aria-label={`删除 ${n.name}`} onClick={noop}>
            删
          </button>
        )}
      />
      <Toaster />
    </>,
  );
  return { user, onToggle };
}

// —— 长文件名：中间省略，保留扩展名 ——
test("truncates long file names in the middle keeping extension", () => {
  const longName = "很长的文件名称啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊名字很长很长很长很长很长.zip";
  renderList([node({ name: longName })]);
  const btn = screen.getByTitle(longName);
  const shown = btn.textContent ?? "";
  expect(shown).toContain("…");
  expect(shown.endsWith(".zip")).toBe(true); // 保留扩展名
  expect(shown).not.toBe(longName);
  expect(shown.length).toBeLessThan(longName.length);
});

// —— 行点击：单击=选中，双击=打开；操作列点击不冒泡 ——
test("row single click toggles selection, double click opens, action clicks do not bubble", async () => {
  const onOpenFile = vi.fn();
  const user = userEvent.setup();
  const onToggle = vi.fn();
  renderWithProviders(
    <FileList
      nodes={[node()]}
      onOpenDir={noop}
      onOpenFile={onOpenFile}
      selectable
      selected={new Set()}
      onToggle={onToggle}
      actions={(n) => (
        <button type="button" aria-label={`删除 ${n.name}`} onClick={noop}>
          删
        </button>
      )}
    />,
  );
  const row = screen.getByText("hello.txt").closest('[role="row"]')!;
  await user.click(row);
  expect(onToggle).toHaveBeenCalledWith("f1");
  expect(onOpenFile).not.toHaveBeenCalled();
  await user.dblClick(row);
  expect(onOpenFile).toHaveBeenCalledWith(expect.objectContaining({ id: "f1" }));
  // 操作列点击阻断冒泡：不触发行选择
  onToggle.mockClear();
  await user.click(screen.getByRole("button", { name: "删除 hello.txt" }));
  expect(onToggle).not.toHaveBeenCalled();
});

test("部分选中时表头全选框显示 indeterminate", () => {
  renderWithProviders(
    <FileList
      nodes={[node(), node({ id: "f2", name: "world.md" })]}
      onOpenDir={noop}
      onOpenFile={noop}
      selectable
      selected={new Set(["f1"])}
      onToggle={vi.fn()}
      actions={(n) => (
        <button type="button" aria-label={`删除 ${n.name}`} onClick={noop}>
          删
        </button>
      )}
    />,
  );
  const all = screen.getByLabelText("全选") as HTMLInputElement;
  expect(all.indeterminate).toBe(true);
  expect(all).toHaveAttribute("aria-checked", "mixed");
});

test("列表关键动作直接展示：下载/分享/更多，重命名折叠进菜单", () => {
  const onShare = vi.fn();
  renderWithProviders(
    <FileList
      nodes={[node()]}
      onOpenDir={noop}
      onOpenFile={noop}
      onShare={onShare}
      onMoreMenu={vi.fn()}
    />,
  );
  expect(screen.getByRole("link", { name: "下载 hello.txt" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "分享 hello.txt" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "更多操作 hello.txt" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /重命名 hello.txt/ })).not.toBeInTheDocument();
});

test("框选：空白区域拖拽按矩形命中行并替换选择", () => {
  const onSetSelection = vi.fn();
  const { container } = renderWithProviders(
    <FileList
      nodes={[node(), node({ id: "f2", name: "world.md" })]}
      onOpenDir={noop}
      onOpenFile={noop}
      selectable
      selected={new Set()}
      onToggle={noop}
      onSetSelection={onSetSelection}
    />,
  );
  const rows = [...container.querySelectorAll<HTMLElement>("[data-node-id]")];
  rows[0].getBoundingClientRect = () => ({ left: 10, top: 10, right: 100, bottom: 40, width: 90, height: 30, x: 10, y: 10, toJSON: () => ({}) });
  rows[1].getBoundingClientRect = () => ({ left: 10, top: 60, right: 100, bottom: 90, width: 90, height: 30, x: 10, y: 60, toJSON: () => ({}) });
  const area = screen.getByTestId("file-list-area");
  fireEvent.mouseDown(area, { clientX: 0, clientY: 0, button: 0 });
  fireEvent.mouseMove(window, { clientX: 120, clientY: 80 });
  fireEvent.mouseUp(window);
  expect(onSetSelection).toHaveBeenCalledWith(["f1", "f2"]);
});

test("grid video without a server thumbnail falls back to a metadata poster", () => {
  renderWithProviders(
    <FileList
      nodes={[node({ id: "v1", name: "clip.mp4", mime: "video/mp4" })]}
      onOpenDir={noop}
      onOpenFile={noop}
      view="grid"
    />,
  );
  const video = document.querySelector("video");
  expect(video).toBeTruthy();
  expect(video).toHaveAttribute("preload", "metadata");
  expect(video?.getAttribute("src")).toContain("#t=0.1");
});

// —— 名称过滤 ——
test("name filter narrows the list", async () => {
  const { user } = renderList([node(), node({ id: "f2", name: "world.md" })]);
  await user.type(screen.getByLabelText("按名称过滤当前列表"), "wor");
  expect(screen.getByText("world.md")).toBeInTheDocument();
  expect(screen.queryByText("hello.txt")).not.toBeInTheDocument();
});

// —— 排序：表头点击三态（asc → desc → 取消），文件夹始终置顶 ——
test("header sort cycles asc/desc/clear with folders always on top", async () => {
  localStorage.removeItem("mstor_files_table");
  const { user } = renderList([
    node({ id: "f2", name: "b.txt", size: 20, updated_at: 3 }),
    node({ id: "f3", name: "a.txt", size: 5, updated_at: 4 }),
    node({ id: "d1", name: "zzz", is_dir: 1, size: null, mime: null }),
  ]);
  const names = () => screen.getAllByRole("row").map((r) => r.querySelector("[title]")?.getAttribute("title"));
  // 升序：文件夹置顶，文件按名称
  await user.click(screen.getByRole("button", { name: /名称/ }));
  expect(names()).toEqual(["zzz", "a.txt", "b.txt"]);
  // 降序：文件夹仍置顶
  await user.click(screen.getByRole("button", { name: /名称/ }));
  expect(names()).toEqual(["zzz", "b.txt", "a.txt"]);
  // 第三次点击取消：恢复原始顺序
  await user.click(screen.getByRole("button", { name: /名称/ }));
  expect(names()).toEqual(["b.txt", "a.txt", "zzz"]);
  localStorage.removeItem("mstor_files_table");
});

// —— 列显隐：菜单切换并持久化 localStorage ——
test("column show/hide menu toggles size column and persists preference", async () => {
  localStorage.removeItem("mstor_files_table");
  const { user } = renderList([node()]);
  expect(screen.getByRole("button", { name: /大小/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /列显示/ }));
  await user.click(screen.getByLabelText("大小列"));
  expect(screen.queryByRole("button", { name: /大小/ })).not.toBeInTheDocument();
  const saved = JSON.parse(localStorage.getItem("mstor_files_table") ?? "{}");
  expect(saved.showSize).toBe(false);
  localStorage.removeItem("mstor_files_table");
});

// —— 复制文件名：写剪贴板 + toast ——
test("copy filename button writes clipboard and toasts", async () => {
  const { user } = renderList([node()]);
  // userEvent.setup() 会装上它自己的剪贴板 stub，因此需在渲染后再覆盖 navigator.clipboard
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  await user.click(screen.getByRole("button", { name: "复制文件名 hello.txt" }));
  expect(writeText).toHaveBeenCalledWith("hello.txt");
  await waitFor(() => expect(screen.getByText("文件名已复制")).toBeInTheDocument());
});

// —— 空状态 ——
test("empty list shows empty state with CTA", () => {
  renderWithProviders(
    <FileList nodes={[]} onOpenDir={noop} onOpenFile={noop} emptyText="该目录为空" emptyActions={<button type="button">上传文件</button>} />,
  );
  expect(screen.getByText("该目录为空")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "上传文件" })).toBeInTheDocument();
});

// —— 虚拟滚动 ——
test("virtualizes large lists within a window", () => {
  const nodes = Array.from({ length: 80 }, (_, i) => node({ id: `f${i}`, name: `file-${i}.txt` }));
  const { container } = renderWithProviders(<FileList nodes={nodes} onOpenDir={noop} onOpenFile={noop} />);
  expect(screen.getByTestId("file-virtual")).toBeInTheDocument();
  const rendered = container.querySelectorAll("[data-file-row]").length;
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(80);
});

// —— 网格视图：过滤、操作组、选中态、长按选择 ——
test("grid view keeps the name filter and renders per-card actions", async () => {
  const user = userEvent.setup();
  const onToggle = vi.fn();
  renderWithProviders(
    <FileList
      nodes={[node(), node({ id: "f2", name: "world.md" })]}
      onOpenDir={noop}
      onOpenFile={noop}
      view="grid"
      selectable
      selected={new Set()}
      onToggle={onToggle}
      actions={(n) => (
        <button type="button" aria-label={`删除 ${n.name}`} onClick={noop}>
          删
        </button>
      )}
    />,
  );
  expect(screen.getByTestId("file-grid")).toBeInTheDocument();
  // 网格视图此前会丢掉名称过滤输入
  await user.type(screen.getByLabelText("按名称过滤当前列表"), "wor");
  expect(screen.getByText("world.md")).toBeInTheDocument();
  expect(screen.queryByText("hello.txt")).not.toBeInTheDocument();
  // 操作组是卡片上的独立控件：点击不触发行选择/打开
  await user.click(screen.getByRole("button", { name: "删除 world.md" }));
  expect(onToggle).not.toHaveBeenCalled();
});

test("grid selected card uses monochrome border/ring", () => {
  renderWithProviders(
    <FileList
      nodes={[node()]}
      onOpenDir={noop}
      onOpenFile={noop}
      view="grid"
      selectable
      selected={new Set(["f1"])}
      onToggle={noop}
    />,
  );
  const cell = screen.getByTitle("hello.txt").closest("[data-file-row]") as HTMLElement;
  expect(cell).toHaveClass("border-ink", "ring-2");
});

test("grid long press toggles selection on touch", () => {
  vi.useFakeTimers();
  const onToggle = vi.fn();
  renderWithProviders(
    <FileList nodes={[node()]} onOpenDir={noop} onOpenFile={noop} view="grid" selectable selected={new Set()} onToggle={onToggle} />,
  );
  const cell = screen.getByTitle("hello.txt").closest("[data-file-row]") as HTMLElement;
  fireEvent.touchStart(cell);
  vi.advanceTimersByTime(500);
  expect(onToggle).toHaveBeenCalledWith("f1");
  vi.useRealTimers();
});

// —— 拖拽调宽：手柄拖动更新偏好 ——
test("name column resize handle updates width preference", () => {
  localStorage.removeItem("mstor_files_table");
  renderList([node()]);
  const handle = screen.getByLabelText("调整名称列宽");
  fireEvent.mouseDown(handle, { clientX: 100 });
  fireEvent.mouseMove(window, { clientX: 180 });
  fireEvent.mouseUp(window);
  const saved = JSON.parse(localStorage.getItem("mstor_files_table") ?? "{}");
  // 320（默认基准）+ 80 = 400
  expect(saved.nameW).toBe(400);
  localStorage.removeItem("mstor_files_table");
});
