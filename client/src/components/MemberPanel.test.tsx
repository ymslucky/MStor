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

import { listInvitations, listMembers, revokeInvitationByEmail } from "../api/workspaces";

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
