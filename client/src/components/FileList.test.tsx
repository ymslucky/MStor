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
