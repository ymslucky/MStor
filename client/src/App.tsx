import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import { getMe } from "./api/me";
import AppShell, { makeQueryClient } from "./shell/AppShell";
import Browser from "./pages/Browser";
import SharesPage from "./pages/SharesPage";
import TrashPage from "./pages/TrashPage";

const queryClient = makeQueryClient();

// /api/me 401 时 api() 已跳转登录页；这里只负责加载态与 layout 挂载
function RequireAuth() {
  const { isPending } = useQuery({ queryKey: ["me"], queryFn: getMe });
  if (isPending) return <div className="p-8 text-center text-slate-500">加载中…</div>;
  return <AppShell />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/s/:token" element={<div />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Browser />} />
          <Route path="/shares" element={<SharesPage />} />
          <Route path="/trash" element={<TrashPage />} />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}
