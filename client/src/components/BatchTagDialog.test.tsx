import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderWithProviders } from "../test/utils";
import { BatchTagDialog } from "./BatchTagDialog";

vi.mock("../api/library", () => ({
  listTags: vi.fn(),
  attachTag: vi.fn(),
}));

import { attachTag, listTags } from "../api/library";

test("批量标签：选中标签后追加到全部选中节点", async () => {
  vi.mocked(listTags).mockResolvedValue({ tags: [{ id: "t1", name: "重要", nodes: 2 }] });
  vi.mocked(attachTag).mockResolvedValue({ ok: true });
  const onDone = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(<BatchTagDialog nodeIds={["a", "b"]} onClose={onClose} onDone={onDone} />);

  expect(await screen.findByText("重要")).toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: "标签 重要" }));
  await user.click(screen.getByRole("button", { name: "添加到选中项" }));

  await waitFor(() => expect(attachTag).toHaveBeenCalledTimes(2));
  expect(attachTag).toHaveBeenCalledWith("t1", "a");
  expect(attachTag).toHaveBeenCalledWith("t1", "b");
  expect(onDone).toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
