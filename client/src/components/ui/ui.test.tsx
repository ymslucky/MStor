import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderWithProviders } from "../../test/utils";
import { Badge, Button, EmptyState, IconButton } from "./index";

test("Button renders variant classes and respects disabled", () => {
  renderWithProviders(
    <>
      <Button data-testid="primary">保存</Button>
      <Button variant="ghost" data-testid="ghost">取消</Button>
      <Button variant="danger" data-testid="danger">删除</Button>
      <Button disabled data-testid="off">禁用</Button>
    </>,
  );
  expect(screen.getByTestId("primary")).toHaveClass("from-sky-400");
  expect(screen.getByTestId("ghost")).toHaveClass("bg-white/5");
  expect(screen.getByTestId("danger")).toHaveClass("text-danger");
  expect(screen.getByTestId("off")).toBeDisabled();
  expect(screen.getByTestId("off")).toHaveClass("disabled:opacity-50");
});

test("IconButton exposes aria-label as accessible name", () => {
  renderWithProviders(<IconButton label="关闭预览" onClick={() => {}}>✕</IconButton>);
  expect(screen.getByRole("button", { name: "关闭预览" })).toBeInTheDocument();
});

test("EmptyState renders icon, title, description and action", () => {
  renderWithProviders(
    <EmptyState icon="📁" title="该目录为空" description="拖拽文件即可上传" action={<Button>上传</Button>} />,
  );
  expect(screen.getByText("📁")).toBeInTheDocument();
  expect(screen.getByText("该目录为空")).toBeInTheDocument();
  expect(screen.getByText("拖拽文件即可上传")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "上传" })).toBeInTheDocument();
});

test("Badge renders tone classes", () => {
  renderWithProviders(
    <>
      <Badge>默认</Badge>
      <Badge tone="accent">新</Badge>
      <Badge tone="danger">超限</Badge>
      <Badge tone="success">已完成</Badge>
    </>,
  );
  expect(screen.getByText("默认")).toHaveClass("bg-white/10");
  expect(screen.getByText("新")).toHaveClass("text-accent");
  expect(screen.getByText("超限")).toHaveClass("text-danger");
  expect(screen.getByText("已完成")).toHaveClass("text-success");
});
