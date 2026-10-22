import { screen } from "@testing-library/react";
import { FolderOpen, X } from "lucide-react";
import { expect, test } from "vitest";
import { renderWithProviders } from "../../test/utils";
import { Button, EmptyState, IconButton, Pill } from "./index";

test("Button renders variant classes and respects disabled", () => {
  renderWithProviders(
    <>
      <Button data-testid="primary">保存</Button>
      <Button variant="ghost" data-testid="ghost">取消</Button>
      <Button variant="danger" data-testid="danger">删除</Button>
      <Button disabled data-testid="off">禁用</Button>
    </>,
  );
  expect(screen.getByTestId("primary")).toHaveClass("bg-primary");
  expect(screen.getByTestId("ghost")).toHaveClass("border-line-strong");
  expect(screen.getByTestId("danger")).toHaveClass("text-danger-text");
  expect(screen.getByTestId("off")).toBeDisabled();
  expect(screen.getByTestId("off")).toHaveClass("disabled:opacity-45");
});

test("IconButton exposes aria-label as accessible name", () => {
  renderWithProviders(
    <IconButton label="关闭预览" onClick={() => {}}>
      <X size={16} aria-hidden />
    </IconButton>,
  );
  expect(screen.getByRole("button", { name: "关闭预览" })).toBeInTheDocument();
});

test("EmptyState renders lucide icon, title, description and action", () => {
  renderWithProviders(
    <EmptyState icon={FolderOpen} title="该目录为空" description="拖拽文件即可上传" action={<Button>上传</Button>} />,
  );
  // 图标位：Lucide svg 渲染于 empty-state 容器内
  expect(screen.getByTestId("empty-state").querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("heading", { level: 2, name: "该目录为空" })).toBeInTheDocument();
  expect(screen.getByText("拖拽文件即可上传")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "上传" })).toBeInTheDocument();
});

test("Pill renders tone classes", () => {
  renderWithProviders(
    <>
      <Pill>默认</Pill>
      <Pill tone="accent">新</Pill>
      <Pill tone="danger">超限</Pill>
      <Pill tone="success">已完成</Pill>
    </>,
  );
  expect(screen.getByText("默认")).toHaveClass("bg-bg-sub");
  expect(screen.getByText("新")).toHaveClass("text-primary-text");
  expect(screen.getByText("超限")).toHaveClass("text-danger-text");
  expect(screen.getByText("已完成")).toHaveClass("text-success-text");
});
