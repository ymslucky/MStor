import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useUploadQueue } from "./useUploadQueue";
import { UploadQueueProvider, useUploadQueueActions, useUploadQueueState } from "./UploadQueueProvider";

vi.mock("./useUploadQueue", () => ({ useUploadQueue: vi.fn() }));

const item = {
  key: 1,
  name: "a.txt",
  size: 1,
  parentId: "",
  file: new File(["x"], "a.txt"),
  status: "pending" as const,
  progress: 0,
};

let actionsSeen: unknown[] = [];
function Probe() {
  const actions = useUploadQueueActions();
  const { items } = useUploadQueueState();
  actionsSeen.push(actions);
  return <span data-testid="count">{items.length}</span>;
}

// 真实 hook 的动作是 useCallback 稳定引用：测试里也必须跨渲染复用同一组函数
const stableActions = { add: vi.fn(), retry: vi.fn(), cancel: vi.fn(), purge: vi.fn() };

function queue(over: Partial<ReturnType<typeof useUploadQueue>> = {}) {
  return { items: [], ...stableActions, ...over } as unknown as ReturnType<typeof useUploadQueue>;
}

test("进度更新只改变 state 订阅；actions 引用保持稳定", () => {
  actionsSeen = [];
  vi.mocked(useUploadQueue).mockReturnValue(queue());
  const { rerender } = render(
    <UploadQueueProvider>
      <Probe />
    </UploadQueueProvider>,
  );
  expect(screen.getByTestId("count")).toHaveTextContent("0");

  // items 变化（等同一次上传进度 tick）
  vi.mocked(useUploadQueue).mockReturnValue(queue({ items: [item as never] }));
  rerender(
    <UploadQueueProvider>
      <Probe />
    </UploadQueueProvider>,
  );
  expect(screen.getByTestId("count")).toHaveTextContent("1");
  expect(actionsSeen.length).toBeGreaterThanOrEqual(2);
  expect(actionsSeen[actionsSeen.length - 1]).toBe(actionsSeen[0]);
});

test("Provider 外使用给出明确错误（不再偷偷创建第二份队列）", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  function Bad() {
    useUploadQueueActions();
    return null;
  }
  expect(() => render(<Bad />)).toThrow(/UploadQueueProvider/);
  consoleError.mockRestore();
});
