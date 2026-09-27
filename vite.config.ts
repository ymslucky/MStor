import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: "client",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "MStor 家庭云盘",
        short_name: "MStor",
        description: "基于 Cloudflare R2 的私有云盘",
        lang: "zh-CN",
        start_url: "/",
        display: "standalone",
        background_color: "#f4f6f4",
        theme_color: "#f4f6f4",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//, /^\/dav\//, /^\/auth\//],
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
      "/auth": "http://127.0.0.1:8787",
      "/dav": "http://127.0.0.1:8787",
    },
  },
});
