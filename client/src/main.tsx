import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { toast } from "./components/Toaster";
import { initAppearance } from "./lib/appearance";
import "./index.css";

const container = document.getElementById("root");
if (container) {
  initAppearance();
  createRoot(container).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

if (import.meta.env.PROD) {
  // prompt 模式：新 SW 等待用户确认，不再静默跳过等待；提示带「刷新」动作
  void import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        toast("发现新版本，刷新即可更新", "info", { label: "刷新", onClick: () => void updateSW(true) });
      },
      onOfflineReady() {
        toast("已可离线使用", "info");
      },
    });
  });
}
