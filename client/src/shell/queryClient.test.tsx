import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { Toaster } from "../components/Toaster";
import { makeQueryClient } from "./queryClient";

function Probe({ message, silent }: { message: string; silent: boolean }) {
  const q = useQuery({
    queryKey: ["probe", message],
    queryFn: async () => {
      throw new Error(message);
    },
    retry: false,
    meta: silent ? { silent: true } : undefined,
  });
  return <span>{q.isError ? "error" : "pending"}</span>;
}

function renderProbe(silent: boolean, message: string) {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Probe silent={silent} message={message} />
      <Toaster />
    </QueryClientProvider>,
  );
}

test("meta.silent 的查询错误不再全局 toast（页面内联展示）", async () => {
  renderProbe(true, "silent-boom");
  await waitFor(() => expect(screen.getByText("error")).toBeInTheDocument());
  // 给 QueryCache.onError 一个 tick
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByText("silent-boom")).not.toBeInTheDocument();
});

test("普通查询错误仍然 toast", async () => {
  renderProbe(false, "loud-boom");
  await waitFor(() => expect(screen.getByText("error")).toBeInTheDocument());
  expect(await screen.findByText("loud-boom")).toBeInTheDocument();
});
