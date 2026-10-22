import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import type { Node } from "../api/types";
import { renderWithProviders } from "../test/utils";

vi.mock("../api/library", () => ({
  listTags: vi.fn(),
  listNodeTags: vi.fn(),
  createTag: vi.fn(),
  attachTag: vi.fn(),
  detachTag: vi.fn(),
}));

import { attachTag, createTag, detachTag, listNodeTags, listTags } from "../api/library";
import { TagDialog } from "./TagDialog";

const NODE: Node = {
  id: "n1", parent_id: "", name: "a.txt", is_dir: 0, size: 1, mime: "text/plain", created_at: 1, updated_at: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listTags).mockResolvedValue({
    tags: [
      { id: "t1", name: "家庭", nodes: 2 },
      { id: "t2", name: "工作", nodes: 0 },
    ],
  });
  vi.mocked(listNodeTags).mockResolvedValue({ tags: [{ id: "t1", name: "家庭" }] });
  vi.mocked(attachTag).mockResolvedValue({ ok: true });
  vi.mocked(detachTag).mockResolvedValue({ ok: true });
  vi.mocked(createTag).mockResolvedValue({ id: "t3", name: "旅行" });
});

test("回显已打标签并支持勾选打标/取消", async () => {
  const user = userEvent.setup();
  renderWithProviders(<TagDialog node={NODE} onClose={() => {}} />);

  const family = await screen.findByRole("checkbox", { name: "标签 家庭" });
  await waitFor(() => expect(family).toBeChecked());
  expect(screen.getByRole("checkbox", { name: "标签 工作" })).not.toBeChecked();

  await user.click(screen.getByRole("checkbox", { name: "标签 工作" }));
  await waitFor(() => expect(attachTag).toHaveBeenCalledWith("t2", "n1"));

  await user.click(family);
  await waitFor(() => expect(detachTag).toHaveBeenCalledWith("t1", "n1"));
});

test("新建标签会自动打在当前节点上", async () => {
  const user = userEvent.setup();
  renderWithProviders(<TagDialog node={NODE} onClose={() => {}} />);
  await screen.findByRole("checkbox", { name: "标签 家庭" });
  await user.type(screen.getByLabelText("新标签名"), "旅行");
  await user.click(screen.getByRole("button", { name: "创建并添加" }));
  await waitFor(() => expect(createTag).toHaveBeenCalledWith("旅行"));
  await waitFor(() => expect(attachTag).toHaveBeenCalledWith("t3", "n1"));
});
