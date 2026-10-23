import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AuditTable } from "./AuditTable";

test("audit table localizes invitation actions and owns vertical scroll on desktop", () => {
  const events = Array.from({ length: 20 }, (_, i) => ({
    action: i % 2 === 0 ? "invitation.create" : "invitation.revoke",
    actorName: "Alice",
    targetId: "b@example.com",
    createdAt: 1_700_000_000_000 + i,
  }));
  const { container } = render(<AuditTable events={events} />);
  expect(screen.getAllByText("创建邀请").length).toBeGreaterThan(0);
  expect(screen.getAllByText("撤销邀请").length).toBeGreaterThan(0);
  const table = container.querySelector("table");
  expect(table?.parentElement?.className).toContain("md:overflow-auto");
  // sticky 必须落在 th 上（border-collapse 下只给 thead 背景会透出数据行）
  const th = table?.querySelector("th");
  expect(th?.className).toContain("sticky");
  expect(th?.className).toContain("bg-bg-sub");
});
