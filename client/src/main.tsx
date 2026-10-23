import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
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
  // autoUpdate：静默更新，不弹「发现新版本」；离线状态由 OfflineBar/StatusBar 承担
  void import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
