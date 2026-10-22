import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderWithProviders } from "../test/utils";
import { MemberPanel } from "./MemberPanel";

vi.mock("../api/workspaces", () => ({
  listMembers: vi.fn(),
  listInvitations: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitationByEmail: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));

import { createInvitation, listInvitations, listMembers, revokeInvitationByEmail } from "../api/workspaces";

test("待接受邀请按邮箱撤销（列表不回传 token）", async () => {
  vi.mocked(listMembers).mockResolvedValue({ members: [] });
  vi.mocked(listInvitations).mockResolvedValue({
    invitations: [{ email: "b@example.com", role: "member", created_at: 1, expires_at: Date.now() + 86400000 }],
  });
  vi.mocked(revokeInvitationByEmail).mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  renderWithProviders(<MemberPanel />);

  expect(await screen.findByText("b@example.com")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "撤销" }));
  await waitFor(() => expect(revokeInvitationByEmail).toHaveBeenCalledWith("b@example.com"));
});

test("创建邀请后自动复制，并提供可点击的复制链接", async () => {
  vi.mocked(listMembers).mockResolvedValue({ members: [] });
  vi.mocked(listInvitations).mockResolvedValue({ invitations: [] });
  vi.mocked(createInvitation).mockResolvedValue({ token: "t", expiresAt: 2, url: "https://mstor.example/?invite=t" });
  const user = userEvent.setup();
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  renderWithProviders(<MemberPanel />);

  await user.type(screen.getByPlaceholderText("name@example.com"), "b@example.com");
  await user.click(screen.getByRole("button", { name: "生成邀请链接" }));
  await waitFor(() => expect(createInvitation).toHaveBeenCalledWith("b@example.com", "member"));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://mstor.example/?invite=t"));
  expect(screen.getByLabelText("邀请链接")).toHaveValue("https://mstor.example/?invite=t");

  await user.click(screen.getByRole("button", { name: "复制链接" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
});

test("待接受邀请可重新生成链接", async () => {
  vi.mocked(listMembers).mockResolvedValue({ members: [] });
  vi.mocked(listInvitations).mockResolvedValue({
    invitations: [{ email: "b@example.com", role: "admin", created_at: 1, expires_at: Date.now() + 86400000 }],
  });
  vi.mocked(createInvitation).mockResolvedValue({ token: "t", expiresAt: 2, url: "https://mstor.example/?invite=t" });
  const user = userEvent.setup();
  renderWithProviders(<MemberPanel />);

  expect(await screen.findByText("b@example.com")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "重新生成" }));
  await waitFor(() => expect(createInvitation).toHaveBeenCalledWith("b@example.com", "admin"));
});
