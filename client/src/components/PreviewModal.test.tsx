import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { JSX } from "react";
import type { Node } from "../api/types";
import PreviewModal from "./PreviewModal";

function node(over: Partial<Node> = {}): Node {
  return { id: "f1", parent_id: "", name: "f", is_dir: 0, size: 10, mime: "image/png", created_at: 1, updated_at: 2, ...over };
}

test("renders image with inline content url and download link", async () => {
  const { user } = setup(<PreviewModal node={node({ mime: "image/png", name: "pic.png" })} onClose={() => {}} />);
  expect(await screen.findByRole("img")).toHaveAttribute("src", "/api/files/f1/content");
  expect(screen.getByRole("link", { name: "下载" })).toHaveAttribute("href", "/api/files/f1/content?dl=1");
  await user.click(screen.getByRole("button", { name: "关闭" }));
});

test("renders video with controls", () => {
  render(<PreviewModal node={node({ mime: "video/mp4" })} onClose={() => {}} />);
  expect(document.querySelector("video[controls]")).toBeTruthy();
});

test("text preview fetches first 1MB and shows content", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("hello mstor", { status: 206 })));
  setup(<PreviewModal node={node({ mime: "text/plain", name: "a.txt" })} onClose={() => {}} />);
  expect(await screen.findByText("hello mstor")).toBeInTheDocument();
  const call = vi.mocked(fetch).mock.calls[0];
  expect((call[1] as RequestInit).headers).toEqual({ range: "bytes=0-1048575" });
  vi.unstubAllGlobals();
});

test("unknown mime falls back to download hint", async () => {
  setup(<PreviewModal node={node({ mime: "application/zip", name: "a.zip" })} onClose={() => {}} />);
  expect(await screen.findByText(/该文件类型不支持在线预览/)).toBeInTheDocument();
});

function setup(ui: JSX.Element) {
  const utils = render(ui);
  return { ...utils, user: userEvent.setup() };
}
