import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { navigateFallbackDenylist } from "./client/src/lib/service-worker-navigation";

export default defineConfig({
  root: "client",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // autoUpdate：新 SW 直接接管，不再用 toast 打断用户；页面下次刷新/导航即用新版本
      registerType: "autoUpdate",
      manifest: {
        name: "MStor 家庭云盘",
        short_name: "MStor",
        description: "基于 Cloudflare R2 的私有云盘",
        lang: "zh-CN",
        start_url: "/",
        display: "standalone",
        background_color: "#f5f6f8",
        theme_color: "#f5f6f8",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallbackDenylist,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === location.origin && url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            method: "GET",
            options: { cacheName: "assets-cache", expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  build: { outDir: "../client/dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
