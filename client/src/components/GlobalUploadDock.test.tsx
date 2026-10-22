import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

// 固定队列：单项 ratio=0.5 / 100B → 整体与单项都应是 50%（回归：曾经把 0..1 当百分比再除 100，显示 1%）
vi.mock("../hooks/useUploadQueue", () => ({
  useUploadQueue: vi.fn(() => ({
    items: [
      {
        key: 1,
        name: "a.txt",
        size: 100,
        parentId: "",
        file: new File(["x"], "a.txt"),
        status: "uploading",
        progress: 0.5,
        speed: 0,
      },
    ],
    add: vi.fn(),
    retry: vi.fn(),
    cancel: vi.fn(),
    purge: vi.fn(),
    clearFinished: vi.fn(),
  })),
}));

import { UploadQueueProvider } from "../hooks/UploadQueueProvider";
import { GlobalUploadDock } from "./GlobalUploadDock";

test("upload progress uses the 0..1 ratio contract (50% stays 50%)", () => {
  const { container } = render(
    <UploadQueueProvider>
      <GlobalUploadDock />
    </UploadQueueProvider>,
  );
  expect(screen.getByText(/上传（1 个进行中/)).toBeInTheDocument();
  // 整体进度条 + 单项进度条都是 50%，不应出现 1%
  expect(container.querySelectorAll('[style*="width: 50%"]').length).toBe(2);
  expect(container.innerHTML).not.toContain("width: 1%");
});
